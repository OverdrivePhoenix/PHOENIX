import os
import sys
import io
import time
import socket
import urllib.request
import threading
import logging
import traceback

# In PyInstaller windowed mode (console=False), sys.stdout and sys.stderr are None.
# Libraries like uvicorn call sys.stdout.isatty(), which raises AttributeError.
class DummyStream:
    def write(self, data):
        pass
    def flush(self):
        pass
    def isatty(self):
        return False

if sys.stdout is None:
    sys.stdout = DummyStream()
if sys.stderr is None:
    sys.stderr = DummyStream()
if sys.stdin is None:
    sys.stdin = io.StringIO()

if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
    BUNDLE_DIR = sys._MEIPASS
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = APP_DIR

# Setup logging
LOG_FILE = os.path.join(APP_DIR, "phoenix_runtime.log")
DIAG_FILE = os.path.join(APP_DIR, "phoenix_runtime.txt")
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

def log_debug(msg: str):
    try:
        logging.info(msg)
    except Exception:
        pass

def log_diag(msg: str):
    log_debug(msg)
    try:
        with open(DIAG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass

def init_dpi_awareness():
    """Must run at the very top of entry point before importing/creating any GUI windows."""
    try:
        import ctypes
        user32 = ctypes.windll.user32
        user32.SetProcessDpiAwarenessContext.argtypes = [ctypes.c_void_p]
        user32.SetProcessDpiAwarenessContext.restype = ctypes.c_bool
        ok = user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
        if not ok:
            err = ctypes.windll.kernel32.GetLastError()
            log_diag(f"dpi awareness set(-4): False (err={err}); trying SetProcessDpiAwareness(2)")
            try:
                ctypes.windll.shcore.SetProcessDpiAwareness(2)
            except Exception:
                user32.SetProcessDPIAware()
        else:
            log_diag("dpi awareness set: True (PER_MONITOR_AWARE_V2 = -4)")
    except Exception as e:
        log_diag(f"dpi awareness notice: {e}")

init_dpi_awareness()

# Ensure app package is in sys.path
api_app_dir = os.path.join(BUNDLE_DIR, "app")
if os.path.exists(api_app_dir) and BUNDLE_DIR not in sys.path:
    sys.path.insert(0, BUNDLE_DIR)
api_pkg_dir = os.path.join(BUNDLE_DIR, "apps", "api")
if os.path.exists(api_pkg_dir) and api_pkg_dir not in sys.path:
    sys.path.insert(0, api_pkg_dir)

# Global runtime state
control_server = None
local_server = None
tray_icon = None
main_window = None
voice_overlay_window = None
is_quitting = False
notch_visible = True

def _load_overlay_tokens():
    import json
    candidates = [
        os.path.join(BUNDLE_DIR, "constants", "overlayTokens.json"),
        os.path.join(APP_DIR, "apps", "dashboard", "src", "constants", "overlayTokens.json"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    return {
        "window": {"width": 552, "height": 196},
        "states": {"idle": {"width": 168, "height": 34}}
    }

import math

_OVERLAY_TOKENS = _load_overlay_tokens()
STATES = _OVERLAY_TOKENS["states"]
TOP_GAP_DIP = int(_OVERLAY_TOKENS.get("topGap", 6))
OVERLAY_WIDTH = int(_OVERLAY_TOKENS["window"]["width"])
OVERLAY_HEIGHT = int(_OVERLAY_TOKENS["window"]["height"])
DEBUG_SHAPE = os.environ.get("PHOENIX_DEBUG_SHAPE") == "1"


class Spring:
    def __init__(self, x: float, k: float = 420.0, zeta: float = 0.72):
        self.x = self.target = float(x)
        self.v = 0.0
        self.k = k
        self.c = 2.0 * zeta * math.sqrt(k)

    def step(self, dt: float):
        a = self.k * (self.target - self.x) - self.c * self.v
        self.v += a * dt
        self.x += self.v * dt

    @property
    def settled(self) -> bool:
        return abs(self.target - self.x) < 0.25 and abs(self.v) < 2.0


current_island_state = "idle"
cur_dim = {"w": int(STATES["idle"]["width"]), "h": int(STATES["idle"]["height"])}
sw = Spring(float(STATES["idle"]["width"]), k=420.0, zeta=0.72)
sh = Spring(float(STATES["idle"]["height"]), k=360.0, zeta=0.74)
spring_lock = threading.Lock()
spring_thread_running = False
hover_in_timer = None
hover_out_timer = None
approval_collapse_timer = None
tween_cancel = False


last_scale = 1.0


def scale_of(hwnd: int) -> float:
    try:
        import ctypes
        from ctypes import wintypes
        dpi = ctypes.windll.user32.GetDpiForWindow(wintypes.HWND(hwnd)) or 96
        return dpi / 96.0
    except Exception:
        return 1.0


def px(dip: float, s: float) -> int:
    return int(round(dip * s))


def get_primary_monitor_rect_physical():
    import ctypes
    from ctypes import Structure, c_int, wintypes

    class RECT(Structure):
        _fields_ = [("left", c_int), ("top", c_int), ("right", c_int), ("bottom", c_int)]

    class MONITORINFO(Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", RECT), ("rcWork", RECT), ("dwFlags", wintypes.DWORD)]

    user32 = ctypes.windll.user32
    pt = wintypes.POINT(0, 0)
    hmon = user32.MonitorFromPoint(pt, 1)
    mi = MONITORINFO()
    mi.cbSize = ctypes.sizeof(MONITORINFO)
    if user32.GetMonitorInfoW(hmon, ctypes.byref(mi)):
        return mi.rcMonitor
    return RECT(0, 0, user32.GetSystemMetrics(0), user32.GetSystemMetrics(1))


def get_overlay_hwnd() -> int:
    """Returns the TOP-LEVEL WinForms Form handle directly via window.native.Handle (verified in winforms.py:195,204)."""
    global voice_overlay_window
    try:
        if voice_overlay_window and hasattr(voice_overlay_window, "native") and voice_overlay_window.native:
            return int(voice_overlay_window.native.Handle.ToInt32())
    except Exception:
        pass
    try:
        import ctypes
        return ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch") or 0
    except Exception:
        return 0


def verify_root_rgn(hwnd: int):
    """Re-reads GetWindowRgnBox on the root Form; if NULLREGION or full rect, re-applies SetWindowRgn."""
    try:
        t, rb = _rgn_info(hwnd)
        wr = _rect_tuple(hwnd)
        win_w = wr[2] - wr[0]
        win_h = wr[3] - wr[1]
        if t in (0, 1) or (rb[0] == 0 and rb[1] == 0 and rb[2] >= win_w and rb[3] >= win_h):
            log_diag(f"[A2:verify_root_rgn] Region lost/full (t={t}, rb={rb}, win={win_w}x{win_h}); re-applying")
            set_notch_region(hwnd, cur_dim["w"], cur_dim["h"])
        else:
            log_diag(f"[A2:verify_root_rgn] Root rgn intact: t={t}, rb={rb}")
    except Exception as e:
        log_diag(f"[A2:verify_root_rgn] error: {e}")


def place_overlay(hwnd: int) -> float:
    """Positions and sizes the overlay window in physical px from DIP tokens, flush at monitor rcMonitor top-center."""
    global last_scale
    try:
        import ctypes
        from ctypes import wintypes, c_int, c_void_p
        user32 = ctypes.windll.user32
        user32.SetWindowPos.argtypes = [c_void_p, c_void_p, c_int, c_int, c_int, c_int, wintypes.UINT]
        user32.SetWindowPos.restype = wintypes.BOOL

        mon = get_primary_monitor_rect_physical()
        HWND_TOPMOST = c_void_p(-1)
        FLAGS = 0x0010 | 0x0040  # SWP_NOACTIVATE | SWP_SHOWWINDOW

        # Move to target monitor first so GetDpiForWindow reflects that monitor
        user32.SetWindowPos(hwnd, HWND_TOPMOST, mon.left, mon.top, 1, 1, FLAGS)
        s = scale_of(hwnd)
        last_scale = s
        W, H = px(OVERLAY_WIDTH, s), px(OVERLAY_HEIGHT, s)
        X = mon.left + (mon.right - mon.left - W) // 2
        Y = mon.top  # rcMonitor.top -> flush with top bezel
        user32.SetWindowPos(hwnd, HWND_TOPMOST, X, Y, W, H, FLAGS)

        if voice_overlay_window and hasattr(voice_overlay_window, "native") and voice_overlay_window.native:
            try:
                import webview.platforms.winforms as wf
                form = voice_overlay_window.native
                def _sync_dock():
                    if hasattr(form, "webview") and form.webview is not None:
                        form.webview.Dock = wf.WinForms.DockStyle.Fill
                if form.InvokeRequired:
                    form.Invoke(wf.Func[wf.Type](_sync_dock))
                else:
                    _sync_dock()
            except Exception:
                pass
        return s
    except Exception as e:
        log_diag(f"place_overlay error: {e}")
        return 1.0


def _cls_name(h: int) -> str:
    import ctypes
    b = ctypes.create_unicode_buffer(256)
    ctypes.windll.user32.GetClassNameW(h, b, 256)
    return b.value


def _rect_tuple(h: int):
    import ctypes
    from ctypes import wintypes
    r = wintypes.RECT()
    ctypes.windll.user32.GetWindowRect(h, ctypes.byref(r))
    return (r.left, r.top, r.right, r.bottom)


def _rgn_info(h: int):
    import ctypes
    from ctypes import wintypes
    r = wintypes.RECT()
    t = ctypes.windll.user32.GetWindowRgnBox(h, ctypes.byref(r))
    return t, (r.left, r.top, r.right, r.bottom)


def list_windows_overlapping(R):
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    out = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(h, _):
        if user32.IsWindowVisible(h):
            r = _rect_tuple(h)
            if r[0] < R[2] and r[2] > R[0] and r[1] < R[3] and r[3] > R[1]:
                b = ctypes.create_unicode_buffer(256)
                user32.GetWindowTextW(h, b, 256)
                ex = user32.GetWindowLongW(h, -20) & 0xFFFFFFFF
                p = wintypes.DWORD()
                user32.GetWindowThreadProcessId(h, ctypes.byref(p))
                out.append((h, _cls_name(h), b.value, r, hex(ex), p.value, p.value == os.getpid()))
        return True
    user32.EnumWindows(cb, 0)
    return out


def get_screen_pixel(x: int, y: int):
    import ctypes
    hdc = ctypes.windll.user32.GetDC(0)
    c = ctypes.windll.gdi32.GetPixel(hdc, int(x), int(y))
    ctypes.windll.user32.ReleaseDC(0, hdc)
    if c == -1 or c == 0xFFFFFFFF:
        return None
    return (c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF)


def describe_hwnd(tag: str, hwnd: int):
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        root = user32.GetAncestor(hwnd, 2)  # GA_ROOT = 2
        log_diag(
            f"[A1:{tag}] hwnd={hwnd:#x} class={_cls_name(hwnd)} rect={_rect_tuple(hwnd)} rgn={_rgn_info(hwnd)} "
            f"root={root:#x} root_class={_cls_name(root)} root_rgn={_rgn_info(root)}"
        )
        kids = []
        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def cb(h, _):
            kids.append((h, _cls_name(h), _rect_tuple(h), _rgn_info(h)))
            return True
        user32.EnumChildWindows(root, cb, 0)
        for k in kids:
            log_diag(f"    child hwnd={k[0]:#x} class={k[1]} rect={k[2]} rgn={k[3]}")
    except Exception as e:
        log_diag(f"[A1:{tag}] describe error: {e}")


def probe_point(tag: str, x: int, y: int):
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        h = user32.WindowFromPoint(wintypes.POINT(int(x), int(y)))
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
        log_diag(f"[A1:{tag}] point=({x},{y}) -> hwnd={h:#x} class={_cls_name(h)} pid={pid.value} ours={pid.value == os.getpid()}")
    except Exception as e:
        log_diag(f"[A1:{tag}] probe error: {e}")


def log_overlay_diagnostics(tag: str, hwnd: int, w_dip: int, h_dip: int):
    """Logs DPI, physical Window/Client rects, awareness context, and JS viewport dimensions to phoenix_runtime.txt."""
    try:
        import ctypes
        from ctypes import Structure, c_int, wintypes
        user32 = ctypes.windll.user32

        class RECT(Structure):
            _fields_ = [("left", c_int), ("top", c_int), ("right", c_int), ("bottom", c_int)]

        dpi = user32.GetDpiForWindow(wintypes.HWND(hwnd)) or 96
        s = dpi / 96.0
        wr, cr = RECT(), RECT()
        user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(wr))
        user32.GetClientRect(wintypes.HWND(hwnd), ctypes.byref(cr))

        awareness = -1
        try:
            user32.GetThreadDpiAwarenessContext.restype = ctypes.c_void_p
            user32.GetAwarenessFromDpiAwarenessContext.argtypes = [ctypes.c_void_p]
            user32.GetAwarenessFromDpiAwarenessContext.restype = c_int
            ctx = user32.GetThreadDpiAwarenessContext()
            awareness = user32.GetAwarenessFromDpiAwarenessContext(ctx)
        except Exception:
            pass

        js_info = None
        try:
            if voice_overlay_window:
                js_info = voice_overlay_window.evaluate_js("[window.innerWidth, window.innerHeight, window.devicePixelRatio]")
        except Exception:
            pass

        r_dip = min(24, h_dip // 2)
        log_diag(
            f"[DIAG:{tag}] dpi={dpi} scale={s:.2f} awareness={awareness} "
            f"WinRect=({wr.left},{wr.top},{wr.right - wr.left}x{wr.bottom - wr.top}) "
            f"ClientRect=({cr.right}x{cr.bottom}) "
            f"DIP_win=({OVERLAY_WIDTH}x{OVERLAY_HEIGHT}) Phys_win=({px(OVERLAY_WIDTH, s)}x{px(OVERLAY_HEIGHT, s)}) "
            f"DIP_state=({w_dip}x{h_dip},r={r_dip}) Phys_rgn=({px(w_dip, s)}x{px(h_dip, s)},R={px(r_dip, s)}) "
            f"JS={js_info}"
        )
    except Exception as e:
        log_diag(f"[DIAG:{tag}] error: {e}")


def set_notch_region(hwnd: int, w_dip: float, h_dip: float):
    """Applies a fully-rounded floating pill Win32 SetWindowRgn (radius = min(h/2, 36) DIP) at TOP_GAP_DIP."""
    try:
        import ctypes
        from ctypes import wintypes
        gdi32 = ctypes.windll.gdi32
        user32 = ctypes.windll.user32

        s = scale_of(hwnd)
        Wn = max(1, px(w_dip, s))
        Hn = max(1, px(h_dip, s))
        top_gap_px = px(TOP_GAP_DIP, s)
        r_dip = min(h_dip / 2.0, 36.0)
        R = max(1, px(r_dip, s))
        x0 = (px(OVERLAY_WIDTH, s) - Wn) // 2

        rgn = gdi32.CreateRoundRectRgn(x0, top_gap_px, x0 + Wn + 1, top_gap_px + Hn + 1, 2 * R, 2 * R)
        if not user32.SetWindowRgn(wintypes.HWND(hwnd), rgn, True):
            gdi32.DeleteObject(rgn)
    except Exception as e:
        log_debug(f"SetWindowRgn notice: {e}")


def _run_spring_loop():
    global spring_thread_running, current_island_state, cur_dim
    import ctypes
    winmm = ctypes.windll.winmm
    winmm.timeBeginPeriod(1)
    times_ms = []
    try:
        last = time.perf_counter()
        while not is_quitting:
            now = time.perf_counter()
            dt = min(now - last, 1.0 / 30.0)
            last = now
            steps = max(1, int(dt / (1.0 / 240.0)))
            sub_dt = dt / steps
            with spring_lock:
                for _ in range(steps):
                    sw.step(sub_dt)
                    sh.step(sub_dt)
                cur_w, cur_h = sw.x, sh.x
                cur_dim["w"], cur_dim["h"] = round(cur_w), round(cur_h)
                done = sw.settled and sh.settled
                target_state = current_island_state

            hwnd = get_overlay_hwnd()
            if hwnd:
                t_a = time.perf_counter()
                set_notch_region(hwnd, cur_w, cur_h)
                times_ms.append((time.perf_counter() - t_a) * 1000.0)

            if done:
                fw, fh = float(STATES[target_state]["width"]), float(STATES[target_state]["height"])
                cur_dim["w"], cur_dim["h"] = int(fw), int(fh)
                if hwnd:
                    set_notch_region(hwnd, fw, fh)
                    verify_root_rgn(hwnd)
                if times_ms:
                    avg_ms = sum(times_ms) / len(times_ms)
                    max_ms = max(times_ms)
                    log_diag(f"[SPRING:{target_state}] frames={len(times_ms)} avg_apply={avg_ms:.3f}ms max_apply={max_ms:.3f}ms")
                try:
                    voice_overlay_window.evaluate_js(
                        f"window.dispatchEvent(new CustomEvent('island:settled', {{ detail: '{target_state}' }}))"
                    )
                except Exception:
                    pass
                break

            elapsed = time.perf_counter() - now
            time.sleep(max(0.0, (1.0 / 60.0) - elapsed))
    finally:
        with spring_lock:
            spring_thread_running = False
        try:
            winmm.timeEndPeriod(1)
        except Exception:
            pass


def transition_island_state(next_state: str):
    """Retargets spring physics smoothly (preserving velocity) and manages approval auto-collapse."""
    global current_island_state, spring_thread_running, approval_collapse_timer
    if is_quitting or not voice_overlay_window or next_state not in STATES:
        return

    with spring_lock:
        if next_state == current_island_state and sw.settled and sh.settled:
            return
        current_island_state = next_state
        sw.target = float(STATES[next_state]["width"])
        sh.target = float(STATES[next_state]["height"])
        need_start = not spring_thread_running
        if need_start:
            spring_thread_running = True

    if approval_collapse_timer:
        try:
            approval_collapse_timer.cancel()
        except Exception:
            pass
        approval_collapse_timer = None

    if next_state == "approval":
        def _auto_collapse():
            if current_island_state == "approval":
                transition_island_state("idle")
        approval_collapse_timer = threading.Timer(10.0, _auto_collapse)
        approval_collapse_timer.daemon = True
        approval_collapse_timer.start()

    try:
        voice_overlay_window.evaluate_js("window.dispatchEvent(new CustomEvent('island:leave'))")
    except Exception:
        pass

    if need_start:
        threading.Thread(target=_run_spring_loop, daemon=True).start()


class NotchApi:
    """Direct JavaScript-to-Python bridge for Dynamic Island state transitions and controls."""
    def set_state(self, next_state: str):
        transition_island_state(next_state)
        return True

    def hover(self, inside: bool):
        global hover_in_timer, hover_out_timer
        if hover_in_timer:
            try:
                hover_in_timer.cancel()
            except Exception:
                pass
            hover_in_timer = None
        if hover_out_timer:
            try:
                hover_out_timer.cancel()
            except Exception:
                pass
            hover_out_timer = None

        if inside:
            if current_island_state == "idle":
                def _enter():
                    if current_island_state == "idle":
                        transition_island_state("hover")
                hover_in_timer = threading.Timer(0.15, _enter)
                hover_in_timer.daemon = True
                hover_in_timer.start()
        else:
            if current_island_state == "hover":
                def _leave():
                    if current_island_state == "hover":
                        transition_island_state("idle")
                hover_out_timer = threading.Timer(0.12, _leave)
                hover_out_timer.daemon = True
                hover_out_timer.start()
        return True

    def toggle_visibility(self):
        toggle_notch_overlay()
        return True

    def open_dashboard(self):
        show_dashboard()
        return True

    def exit_app(self):
        shutdown()
        return True

    def log_error(self, msg: str):
        log_diag(f"[RENDERER_ERROR] {msg}")
        return True


def acquire_single_instance_lock():
    """Acquires a named Windows Mutex to ensure exactly one instance of PHOENIX runs."""
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        mutex_name = "Global\\PHOENIX_DynamicNotch_SingleInstance_Mutex"
        handle = kernel32.CreateMutexW(None, False, mutex_name)
        last_error = kernel32.GetLastError()
        ERROR_ALREADY_EXISTS = 183
        if last_error == ERROR_ALREADY_EXISTS:
            log_debug("Existing PHOENIX instance detected. Restoring dashboard and exiting.")
            show_dashboard()
            sys.exit(0)
        return handle
    except Exception as e:
        log_debug(f"Single instance mutex notice: {e}")
        return None



def get_persisted_voice_id() -> str:
    """Reads user-selected voice from data/tts_settings.json across app directories."""
    candidates = []
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        candidates.append(os.path.join(exe_dir, "data", "tts_settings.json"))
        candidates.append(os.path.join(BUNDLE_DIR, "data", "tts_settings.json"))
    candidates.append(os.path.join(os.getcwd(), "data", "tts_settings.json"))
    candidates.append(os.path.join(os.path.dirname(__file__), "data", "tts_settings.json"))
    candidates.append(os.path.join(os.path.dirname(__file__), "apps", "api", "data", "tts_settings.json"))

    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    voice = cfg.get("active_voice_id")
                    if voice:
                        log_debug(f"Loaded persisted startup voice: {voice} from {path}")
                        return voice
            except Exception:
                pass
    return "en-GB-RyanNeural"


def speak_system_online():
    """Vocalizes 'System online, Sir.' via Windows SAPI / Edge-TTS using persisted voice."""
    def _speak():
        try:
            persisted_voice = get_persisted_voice_id()
            try:
                import edge_tts
                import asyncio
                import tempfile
                import winsound

                async def _edge_synth():
                    comm = edge_tts.Communicate("System online, Sir.", voice=persisted_voice)
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fp:
                        temp_path = fp.name
                    await comm.save(temp_path)
                    return temp_path

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                wav_file = loop.run_until_complete(_edge_synth())
                winsound.PlaySound(wav_file, winsound.SND_FILENAME | winsound.SND_ASYNC)
                log_debug(f"Spoke 'System online, Sir.' with voice '{persisted_voice}' successfully.")
                return
            except Exception as edge_err:
                log_debug(f"Edge-TTS startup notice: {edge_err}; using SAPI fallback.")

            import win32com.client
            speaker = win32com.client.Dispatch("SAPI.SpVoice")
            voices = speaker.GetVoices()
            for v in voices:
                desc = v.GetDescription().lower()
                if "george" in desc or "british" in desc or "uk" in desc or "hazel" in desc:
                    speaker.Voice = v
                    break
            speaker.Rate = 0
            speaker.Volume = 100
            speaker.Speak("System online, Sir.")
            log_debug("Spoke 'System online, Sir.' via SAPI successfully.")
        except Exception as e:
            log_debug(f"SAPI voice notice: {e}, attempting PowerShell fallback...")
            try:
                import subprocess
                subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-WindowStyle",
                        "Hidden",
                        "-Command",
                        "(New-Object -ComObject SAPI.SpVoice).Speak('System online, Sir.')"
                    ],
                    creationflags=0x08000000
                )
            except Exception:
                pass

    t = threading.Thread(target=_speak, daemon=True)
    t.start()


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0


def wait_for_server(url: str, timeout: float = 12.0) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'PHOENIX-Launcher'})
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


def start_control_plane_server(port: int = 8000):
    global control_server
    try:
        log_debug(f"Starting Control Plane Server on port {port}...")
        import uvicorn
        from app.main import app as control_app

        config = uvicorn.Config(
            app=control_app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            access_log=False,
            log_config=None
        )
        control_server = uvicorn.Server(config)
        control_server.run()
    except Exception as e:
        log_debug(f"Control Plane Server Exception: {e}\n{traceback.format_exc()}")


def start_local_node_server(port: int = 8001):
    global local_server
    try:
        log_debug(f"Starting Local Node Bridge on port {port}...")
        import uvicorn
        import importlib.util

        local_main_path = os.path.join(BUNDLE_DIR, "apps", "local-node", "app", "main.py")
        if os.path.exists(local_main_path):
            spec = importlib.util.spec_from_file_location("local_node_main", local_main_path)
            local_mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(local_mod)
            local_app = getattr(local_mod, "app", None)
            if local_app:
                config = uvicorn.Config(
                    app=local_app,
                    host="127.0.0.1",
                    port=port,
                    log_level="warning",
                    access_log=False,
                    log_config=None
                )
                local_server = uvicorn.Server(config)
                local_server.run()
    except Exception as e:
        log_debug(f"Local Node Server Exception: {e}\n{traceback.format_exc()}")


def set_notch_geometry(expanded: bool = False):
    """Keeps the native notch overlay window sized and centered in physical px from DIP tokens."""
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
        if not hwnd:
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
        if hwnd:
            place_overlay(hwnd)
            set_notch_region(hwnd, cur_dim["w"], cur_dim["h"])
    except Exception as e:
        log_diag(f"Notch geometry notice: {e}")


def start_dpi_monitor():
    """Polls scale_of(hwnd) and monitor bounds; re-places and re-regions overlay on DPI or display change."""
    last_mon = None
    while not is_quitting:
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
            if hwnd:
                s = scale_of(hwnd)
                mon = get_primary_monitor_rect_physical()
                mon_tuple = (mon.left, mon.top, mon.right, mon.bottom)
                if abs(s - last_scale) > 0.01 or (last_mon is not None and mon_tuple != last_mon):
                    log_diag(f"DPI/Display change detected: scale {last_scale}->{s}, mon {last_mon}->{mon_tuple}")
                    place_overlay(hwnd)
                    set_notch_region(hwnd, cur_dim["w"], cur_dim["h"])
                    verify_root_rgn(hwnd)
                    log_overlay_diagnostics("dpi_change", hwnd, cur_dim["w"], cur_dim["h"])
                last_mon = mon_tuple
        except Exception:
            pass
        time.sleep(0.8)


def show_dashboard():
    """Restores and presents the full command center dashboard window on demand."""
    global main_window
    try:
        if main_window:
            main_window.show()
            main_window.restore()
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "Project PHOENIX // Autonomous AI Engineering Organization")
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                ctypes.windll.user32.SetForegroundWindow(hwnd)
                log_debug("Full dashboard window displayed and brought to foreground.")
    except Exception as e:
        log_debug(f"Notice showing dashboard: {e}")


def start_global_hotkey_listener():
    """Listens for global Windows shortcut Ctrl+Shift+Space to toggle or summon Dynamic Island."""
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        MOD_CONTROL = 0x0002
        MOD_SHIFT = 0x0004
        MOD_NOREPEAT = 0x4000
        VK_SPACE = 0x20
        HOTKEY_ID = 101

        reg = user32.RegisterHotKey(None, HOTKEY_ID, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, VK_SPACE)
        if reg:
            log_debug("Registered global hotkey Ctrl+Shift+Space for Dynamic Island.")
        else:
            log_debug("Notice: Could not register Ctrl+Shift+Space (may be reserved by another app).")

        msg = wintypes.MSG()
        while not is_quitting:
            if user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 1):
                if msg.message == 0x0312 and msg.wParam == HOTKEY_ID:
                    log_debug("Global hotkey Ctrl+Shift+Space triggered.")
                    toggle_notch_overlay()
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
            time.sleep(0.05)
    except Exception as e:
        log_debug(f"Global hotkey listener notice: {e}")


def configure_voice_overlay_window(expanded: bool = False):
    """Strips native chrome, applies opaque #0A0A0B (or debug magenta) + Win32 SetWindowRgn notch silhouette at top-center."""
    global voice_overlay_window
    try:
        import ctypes
        from ctypes import c_int

        hwnd = get_overlay_hwnd()
        if hwnd:
            GWL_STYLE = -16
            GWL_EXSTYLE = -20
            WS_CAPTION = 0x00C00000
            WS_THICKFRAME = 0x00040000
            WS_BORDER = 0x00800000
            WS_DLGFRAME = 0x00400000
            WS_POPUP = 0x80000000
            WS_EX_TOOLWINDOW = 0x00000080
            WS_EX_TOPMOST = 0x00000008
            WS_EX_NOACTIVATE = 0x08000000

            style = WS_POPUP
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, style)

            ex_style = WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style)

            # Part 1b: Explicit DWM attributes (kill Mica/Acrylic, NC rendering/shadow, rounding, and border)
            dwm = ctypes.windll.dwmapi
            from ctypes import wintypes
            def _dwm_set(attr, value):
                v = ctypes.c_uint32(value & 0xFFFFFFFF)
                hr = dwm.DwmSetWindowAttribute(wintypes.HWND(hwnd), attr, ctypes.byref(v), ctypes.sizeof(v))
                log_diag(f"[1b:dwm] attr={attr} val={hex(value)} hr={hr:#x}")
                return hr

            _dwm_set(2, 1)           # DWMWA_NCRENDERING_POLICY = DWMNCRP_DISABLED
            _dwm_set(33, 1)          # DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_DONOTROUND
            _dwm_set(34, 0xFFFFFFFE) # DWMWA_BORDER_COLOR = DWMWA_COLOR_NONE
            _dwm_set(38, 1)          # DWMWA_SYSTEMBACKDROP_TYPE = DWMSBT_NONE (overrides pywebview Mica 38=2)
            _dwm_set(20, 1)          # DWMWA_USE_IMMERSIVE_DARK_MODE

            if voice_overlay_window and hasattr(voice_overlay_window, "native") and voice_overlay_window.native:
                try:
                    import webview.platforms.winforms as wf
                    form = voice_overlay_window.native

                    def _apply_opaque_bg():
                        form.MinimumSize = wf.Size(0, 0)
                        form.MaximumSize = wf.Size(0, 0)
                        form.FormBorderStyle = getattr(wf.WinForms.FormBorderStyle, 'None')
                        bg = wf.Color.FromArgb(255, 255, 0, 255) if DEBUG_SHAPE else wf.Color.FromArgb(255, 0, 0, 0)
                        form.BackColor = bg
                        if hasattr(form, "webview") and form.webview is not None:
                            form.webview.DefaultBackgroundColor = bg

                    if form.InvokeRequired:
                        form.Invoke(wf.Func[wf.Type](_apply_opaque_bg))
                    else:
                        _apply_opaque_bg()
                except Exception as e:
                    log_debug(f"Form opaque background notice: {e}")

            place_overlay(hwnd)
            set_notch_region(hwnd, cur_dim["w"], cur_dim["h"])
            verify_root_rgn(hwnd)
            describe_hwnd("after_set_notch_region", hwnd)
            r = _rect_tuple(hwnd)
            _, rb = _rgn_info(hwnd)
            for winfo in list_windows_overlapping(r):
                log_diag(f"[A1:overlap] hwnd={winfo[0]:#x} class={winfo[1]} title={winfo[2]!r} rect={winfo[3]} ex={winfo[4]} pid={winfo[5]} ours={winfo[6]}")
            cx = (r[0] + r[2]) // 2
            pts = [
                ("a_center_notch", cx, r[1] + max(5, (rb[3] - rb[1]) // 2)),
                ("b_below_notch", cx, r[1] + rb[3] + 20),
                ("c_left_of_notch", r[0] + max(2, rb[0] - 20), r[1] + 10),
                ("d_right_of_notch", r[0] + min(r[2] - r[0] - 2, rb[2] + 20), r[1] + 10),
            ]
            for ptag, px_x, px_y in pts:
                probe_point(ptag, px_x, px_y)
                log_diag(f"[A1:pixel:{ptag}] ({px_x},{px_y}) rgb={get_screen_pixel(px_x, px_y)}")
            if DEBUG_SHAPE:
                try:
                    voice_overlay_window.evaluate_js("window.__PHOENIX_DEBUG_SHAPE__ = true;")
                except Exception:
                    pass
            threading.Thread(
                target=log_overlay_diagnostics,
                args=("startup", hwnd, cur_dim["w"], cur_dim["h"]),
                daemon=True
            ).start()
    except Exception as e:
        log_debug(f"Voice overlay setup notice: {e}")


def toggle_notch_overlay():
    global notch_visible, voice_overlay_window
    notch_visible = not notch_visible
    if voice_overlay_window:
        try:
            if notch_visible:
                voice_overlay_window.show()
                configure_voice_overlay_window(expanded=False)
            else:
                voice_overlay_window.hide()
        except Exception:
            pass


def start_tray_ipc_listener(main_win, overlay_win):
    """Background listener that monitors IPC events for window restoration, resizing, and clean exit."""
    while not is_quitting:
        try:
            import app.main as main_mod
            if getattr(main_mod, "_exit_app_event", False):
                main_mod._exit_app_event = False
                shutdown()
                break
            if getattr(main_mod, "_restore_window_event", False):
                main_mod._restore_window_event = False
                if main_win:
                    main_win.show()
                    main_win.restore()
            if getattr(main_mod, "_toggle_overlay_event", False):
                main_mod._toggle_overlay_event = False
                toggle_notch_overlay()
            if getattr(main_mod, "_notch_expanded_event", None) is not None:
                expanded = main_mod._notch_expanded_event
                main_mod._notch_expanded_event = None
                set_notch_geometry(expanded)
        except Exception:
            pass
        time.sleep(0.1)


def shutdown():
    """Immediately and cleanly terminates all background servers, windows, and process tree."""
    global is_quitting, tween_cancel, control_server, local_server, tray_icon, main_window, voice_overlay_window
    if is_quitting:
        return
    is_quitting = True
    tween_cancel = True
    _cancel_timers()
    log_debug("Shutting down PHOENIX background services and exiting...")
    if voice_overlay_window:
        try:
            voice_overlay_window.destroy()
        except Exception:
            pass
    if tray_icon:
        try:
            tray_icon.stop()
        except Exception:
            pass
    if main_window:
        try:
            main_window.destroy()
        except Exception:
            pass
    if control_server:
        control_server.should_exit = True
    if local_server:
        local_server.should_exit = True
    os._exit(0)


def init_system_tray(main_win, overlay_win):
    """Creates the Windows System Tray notification area icon and menu."""
    global tray_icon, notch_visible
    try:
        import pystray
        from PIL import Image

        icon_path = os.path.join(BUNDLE_DIR, "phoenix_icon.png")
        if not os.path.exists(icon_path):
            icon_path = os.path.join(APP_DIR, "phoenix_icon.png")

        if os.path.exists(icon_path):
            image = Image.open(icon_path)
        else:
            image = Image.new("RGBA", (64, 64), color=(59, 130, 246, 255))

        def on_open_command_center(icon, item):
            show_dashboard()

        def on_toggle_notch(icon, item):
            toggle_notch_overlay()

        def on_expand_voice(icon, item):
            set_notch_geometry(True)

        def on_toggle_pause(icon, item):
            try:
                req = urllib.request.Request(
                    "http://127.0.0.1:8000/emergency-pause",
                    data=b'{"paused": true}',
                    headers={"Content-Type": "application/json"}
                )
                urllib.request.urlopen(req, timeout=1.0)
            except Exception:
                pass

        def on_exit_app(icon, item):
            shutdown()

        menu = pystray.Menu(
            pystray.MenuItem("Show Dynamic Island" if not notch_visible else "Hide Dynamic Island", on_toggle_notch),
            pystray.MenuItem("Toggle Voice / Expand Island", on_expand_voice),
            pystray.MenuItem("Open Dashboard / Full Controls", on_open_command_center),
            pystray.MenuItem("Emergency Pause", on_toggle_pause),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Exit PHOENIX", on_exit_app)
        )

        tray_icon = pystray.Icon(
            name="PHOENIX",
            icon=image,
            title="Project PHOENIX // Dynamic Island Overlay",
            menu=menu
        )
        tray_thread = threading.Thread(target=tray_icon.run, daemon=True)
        tray_thread.start()
        log_debug("System Tray icon initialized.")
    except Exception as exc:
        log_debug(f"System Tray notice: {exc}")


_greeting_played = False


def _is_master_muted() -> bool:
    try:
        import ctypes
        from ctypes import wintypes
        vol = wintypes.DWORD(0)
        res = ctypes.windll.winmm.waveOutGetVolume(0, ctypes.byref(vol))
        if res == 0 and vol.value == 0:
            return True
    except Exception:
        pass
    return False


def speak_startup_greeting():
    """Plays a short, template-driven startup greeting once per process start using the saved voice."""
    global _greeting_played
    if _greeting_played:
        return
    _greeting_played = True

    def _greet():
        t_start = time.perf_counter()
        try:
            from app.settings_store import load_settings
            cfg, source, path = load_settings()
            log_diag(f"[voice] Loaded settings source={source} path={path} voice={cfg['voice']['id']}")
            if not cfg.get("greeting", {}).get("enabled", True):
                log_diag("[greet] Startup greeting disabled in settings; skipping.")
                return
            if _is_master_muted():
                log_diag("[greet] System master volume is 0/muted; skipping.")
                return

            hour = time.localtime().tm_hour
            tod = "Good morning." if hour < 12 else ("Good afternoon." if hour < 17 else "Good evening.")
            parts = [tod]

            pending_count = 0
            try:
                import json
                with urllib.request.urlopen("http://127.0.0.1:8000/projects", timeout=2.0) as r:
                    projs = json.loads(r.read().decode("utf-8"))
                    if isinstance(projs, list) and projs and projs[0].get("name"):
                        parts.append(f"SWE-03 is active on {projs[0]['name']}.")
            except Exception:
                pass

            try:
                import json
                with urllib.request.urlopen("http://127.0.0.1:8000/approvals", timeout=2.0) as r:
                    apprs = json.loads(r.read().decode("utf-8"))
                    if isinstance(apprs, list):
                        pending_count = sum(1 for a in apprs if a.get("status") == "pending")
                        if pending_count == 1:
                            parts.append("1 approval is waiting.")
                        elif pending_count > 1:
                            parts.append(f"{pending_count} approvals are waiting.")
            except Exception:
                pass

            if time.perf_counter() - t_start > 10.0:
                log_diag("[greet] Timed out (>10s) before synthesis; skipping.")
                return

            greeting_text = " ".join(parts)
            v = cfg["voice"]
            voice_id = v.get("id") or "en-GB-RyanNeural"
            rate_pct = int(round((float(v.get("rate", 1.0)) - 1.0) * 100))
            pitch_hz = int(round((float(v.get("pitch", 1.0)) - 1.0) * 25))
            rate_str = f"{rate_pct:+d}%"
            pitch_str = f"{pitch_hz:+d}Hz"

            log_diag(f"[greet] autoplay=python_winsound voice={voice_id} rate={rate_str} pitch={pitch_str} text={greeting_text!r}")

            transition_island_state("voice")
            try:
                import edge_tts, asyncio, tempfile, winsound
                async def _synth():
                    comm = edge_tts.Communicate(greeting_text, voice=voice_id, rate=rate_str, pitch=pitch_str)
                    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as fp:
                        p = fp.name
                    await comm.save(p)
                    return p

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                mp3_path = loop.run_until_complete(_synth())
                log_diag(f"[greet] onstart voice={voice_id}")
                try:
                    # Convert or play via SAPI/mciSendString for mp3 since winsound only plays WAV
                    import ctypes
                    alias = "phx_greet"
                    mci = ctypes.windll.winmm.mciSendStringW
                    mci(f'close {alias}', None, 0, 0)
                    rc = mci(f'open "{mp3_path}" type mpegvideo alias {alias}', None, 0, 0)
                    if rc == 0:
                        mci(f'play {alias} wait', None, 0, 0)
                        mci(f'close {alias}', None, 0, 0)
                        log_diag("[greet] onend status=ok")
                    else:
                        raise RuntimeError(f"mciSendString open rc={rc}")
                finally:
                    try:
                        os.remove(mp3_path)
                    except Exception:
                        pass
            except Exception as exc:
                log_diag(f"[greet] onerror={exc}; trying SAPI fallback")
                try:
                    import win32com.client
                    sp = win32com.client.Dispatch("SAPI.SpVoice")
                    sp.Speak(greeting_text)
                    log_diag("[greet] onend status=sapi_ok")
                except Exception as sapi_e:
                    log_diag(f"[greet] sapi onerror={sapi_e}")
            finally:
                transition_island_state("approval" if pending_count > 0 else "idle")
        except Exception as e:
            log_diag(f"[greet] onerror={e}")

    threading.Thread(target=_greet, daemon=True).start()


def on_window_ready(window):
    """Callback fired when the Dynamic Island overlay window is displayed."""
    log_debug("Dynamic Island displayed. Configuring notch geometry flush at top-center...")
    try:
        window.restore()
        window.show()
    except Exception:
        pass

    def _ensure_overlay():
        for _ in range(25):
            time.sleep(0.15)
            try:
                import ctypes
                hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
                if not hwnd:
                    hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
                if hwnd:
                    configure_voice_overlay_window(expanded=False)
                    log_debug(f"Configured overlay HWND={hwnd} flush at top-center.")
                    speak_startup_greeting()
                    break
            except Exception:
                pass

    threading.Thread(target=_ensure_overlay, daemon=True).start()


def main():
    global main_window, voice_overlay_window
    log_debug("========== PHOENIX DESKTOP LAUNCHER START ==========")

    # 0. Acquire single instance lock (prevents duplicate zombie processes)
    _lock = acquire_single_instance_lock()

    # Initialize Per-Monitor DPI awareness
    init_dpi_awareness()

    # 2. Start Control Plane (FastAPI + React Dashboard)
    need_start_8000 = True
    if is_port_in_use(8000):
        if wait_for_server("http://127.0.0.1:8000/health", timeout=1.5):
            log_debug("Port 8000 is already active and healthy; reusing existing server.")
            need_start_8000 = False
        else:
            log_debug("Port 8000 reported in use but not responding to /health; starting control plane server...")

    if need_start_8000:
        t1 = threading.Thread(target=start_control_plane_server, args=(8000,), daemon=True)
        t1.start()

    # 3. Start Local Node Daemon bridge if port 8001 is free
    if not is_port_in_use(8001):
        t2 = threading.Thread(target=start_local_node_server, args=(8001,), daemon=True)
        t2.start()

    # 4. Wait for Control Plane health endpoint
    server_ready = wait_for_server("http://127.0.0.1:8000/health", timeout=20.0)
    log_debug(f"Server ready status: {server_ready}")
    target_url = "http://127.0.0.1:8000"
    overlay_url = "http://127.0.0.1:8000/#voice-overlay"

    # 5. Initial DIP dimensions (pywebview WinForms multiplies initial_width/height/x/y by self._scale)
    # place_overlay() will immediately position it on rcMonitor physical px after HWND creation.
    init_pill_w = OVERLAY_WIDTH
    init_pill_h = OVERLAY_HEIGHT
    init_pill_x = 0
    init_pill_y = 0

    # 6. Launch Native Desktop Windows using pywebview (Edge WebView2)
    import webview

    # Full dashboard is created HIDDEN on initial launch (only opens on-demand from tray/island)
    main_window = webview.create_window(
        title="Project PHOENIX // Autonomous AI Engineering Organization",
        url=target_url,
        width=1440,
        height=900,
        min_size=(1080, 680),
        background_color="#0D0F12",
        text_select=True,
        zoomable=True,
        hidden=True
    )

    notch_api = NotchApi()
    # Dynamic Island overlay window: OPAQUE #0A0A0B (or debug #FF00FF), clipped by Win32 SetWindowRgn
    voice_overlay_window = webview.create_window(
        title="PHOENIX Notch",
        url=overlay_url,
        width=init_pill_w,
        height=init_pill_h,
        x=init_pill_x,
        y=init_pill_y,
        min_size=(0, 0),
        frameless=True,
        on_top=True,
        transparent=False,
        background_color="#FF00FF" if DEBUG_SHAPE else "#000000",
        shadow=False,
        resizable=False,
        text_select=False,
        zoomable=False,
        easy_drag=False,
        js_api=notch_api
    )

    # 7. Wire window events
    def on_dashboard_closed():
        log_debug("Dashboard closed by user. Keeping Dynamic Island active.")
        if main_window:
            try:
                main_window.hide()
            except Exception:
                pass

    def on_notch_closed():
        log_debug("Dynamic Island overlay closed. Shutting down PHOENIX.")
        shutdown()

    voice_overlay_window.events.closed += on_notch_closed

    # 8. Initialize System Tray, Global Hotkey, DPI Monitor & IPC Listener
    init_system_tray(main_window, voice_overlay_window)
    threading.Thread(target=start_tray_ipc_listener, args=(main_window, voice_overlay_window), daemon=True).start()
    threading.Thread(target=start_global_hotkey_listener, daemon=True).start()
    threading.Thread(target=start_dpi_monitor, daemon=True).start()

    # 9. Start pywebview event loop with Dynamic Island as primary window
    try:
        log_debug("Starting webview event loop with Dynamic Island as primary...")
        webview.start(on_window_ready, voice_overlay_window, debug=False, http_server=False)
    finally:
        shutdown()
        log_debug("========== PHOENIX DESKTOP LAUNCHER EXIT ==========")


if __name__ == "__main__":
    main()
