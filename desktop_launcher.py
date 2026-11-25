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

_OVERLAY_TOKENS = _load_overlay_tokens()
STATES = _OVERLAY_TOKENS["states"]
OVERLAY_WIDTH = int(_OVERLAY_TOKENS["window"]["width"])
OVERLAY_HEIGHT = int(_OVERLAY_TOKENS["window"]["height"])
DEBUG_SHAPE = os.environ.get("PHOENIX_DEBUG_SHAPE") == "1"

current_island_state = "idle"
cur_dim = {"w": int(STATES["idle"]["width"]), "h": int(STATES["idle"]["height"])}
tween_busy = False
tween_cancel = False
hover_timer = None


def get_window_dpi_scale(hwnd: int) -> float:
    try:
        import ctypes
        dpi = ctypes.windll.user32.GetDpiForWindow(hwnd)
        return dpi / 96.0 if dpi > 0 else 1.0
    except Exception:
        return 1.0


def set_notch_region(hwnd: int, w: int, h: int):
    """Clips the opaque native window to the notch silhouette (square top, rounded bottom) using Win32 SetWindowRgn."""
    try:
        import ctypes
        gdi32 = ctypes.windll.gdi32
        user32 = ctypes.windll.user32

        scale = get_window_dpi_scale(hwnd)
        sw = max(1, int(round(w * scale)))
        sh = max(1, int(round(h * scale)))
        s_win_w = int(round(OVERLAY_WIDTH * scale))
        r = min(int(round(24 * scale)), sh // 2)
        x0 = round((s_win_w - sw) / 2)

        r_round = gdi32.CreateRoundRectRgn(x0, -r, x0 + sw + 1, sh + 1, r * 2, r * 2)
        r_clip = gdi32.CreateRectRgn(x0, 0, x0 + sw, sh)
        r_final = gdi32.CreateRectRgn(0, 0, 0, 0)
        gdi32.CombineRgn(r_final, r_round, r_clip, 1)  # RGN_AND
        gdi32.DeleteObject(r_round)
        gdi32.DeleteObject(r_clip)

        if not user32.SetWindowRgn(hwnd, r_final, True):
            gdi32.DeleteObject(r_final)
    except Exception as e:
        log_debug(f"SetWindowRgn notice: {e}")


def transition_island_state(next_state: str):
    """Main-process state machine: notifies renderer to fade out, tweens SetWindowRgn over 240ms, then notifies settled."""
    global current_island_state, cur_dim, tween_busy, tween_cancel, voice_overlay_window
    if is_quitting or not voice_overlay_window or next_state not in STATES:
        return
    if next_state == current_island_state or tween_busy:
        return

    def _run():
        global current_island_state, cur_dim, tween_busy, tween_cancel
        tween_busy = True
        tween_cancel = False
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
            if not hwnd:
                return

            try:
                voice_overlay_window.evaluate_js("window.dispatchEvent(new CustomEvent('island:leave'))")
            except Exception:
                pass

            time.sleep(0.11)
            if is_quitting or tween_cancel:
                return

            from_w, from_h = cur_dim["w"], cur_dim["h"]
            to_w, to_h = int(STATES[next_state]["width"]), int(STATES[next_state]["height"])
            dur = 0.24
            t0 = time.perf_counter()

            while not is_quitting and not tween_cancel:
                p = min(1.0, (time.perf_counter() - t0) / dur)
                e = 1.0 - pow(1.0 - p, 3)
                cur_dim["w"] = round(from_w + (to_w - from_w) * e)
                cur_dim["h"] = round(from_h + (to_h - from_h) * e)
                set_notch_region(hwnd, cur_dim["w"], cur_dim["h"])
                if p >= 1.0:
                    break
                time.sleep(0.016)

            if not is_quitting and not tween_cancel:
                current_island_state = next_state
                try:
                    voice_overlay_window.evaluate_js(
                        f"window.dispatchEvent(new CustomEvent('island:settled', {{ detail: '{next_state}' }}))"
                    )
                except Exception:
                    pass
        finally:
            tween_busy = False

    threading.Thread(target=_run, daemon=True).start()


class NotchApi:
    """Direct JavaScript-to-Python bridge for notch state transitions and desktop controls."""
    def set_state(self, next_state: str):
        transition_island_state(next_state)
        return True

    def hover(self, inside: bool):
        global hover_timer
        if hover_timer:
            try:
                hover_timer.cancel()
            except Exception:
                pass
            hover_timer = None

        if inside:
            if current_island_state == "idle":
                transition_island_state("hover")
        else:
            if current_island_state == "hover":
                def _leave():
                    if current_island_state == "hover":
                        transition_island_state("idle")
                hover_timer = threading.Timer(0.12, _leave)
                hover_timer.daemon = True
                hover_timer.start()
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


def init_dpi_awareness():
    """Configures Windows Per-Monitor DPI Awareness so notch stays pixel-perfect on scaled displays."""
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)  # Per-Monitor DPI aware
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def get_screen_metrics():
    """Retrieves primary monitor resolution."""
    try:
        import ctypes
        user32 = ctypes.windll.user32
        screen_w = user32.GetSystemMetrics(0)
        screen_h = user32.GetSystemMetrics(1)
        return screen_w, screen_h
    except Exception:
        return 1920, 1080


def set_notch_geometry(expanded: bool = False):
    """Keeps the native notch overlay window fixed at top-center; animations occur in-DOM."""
    try:
        import ctypes
        from ctypes import wintypes, c_int, c_void_p
        hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
        if not hwnd:
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
        if hwnd:
            user32 = ctypes.windll.user32
            user32.SetWindowPos.argtypes = [c_void_p, c_void_p, c_int, c_int, c_int, c_int, wintypes.UINT]
            user32.SetWindowPos.restype = wintypes.BOOL

            screen_w, _ = get_screen_metrics()
            w = OVERLAY_WIDTH
            h = OVERLAY_HEIGHT
            x = max(0, (screen_w - w) // 2)
            y = 0

            HWND_TOPMOST = c_void_p(-1)
            SWP_SHOWWINDOW = 0x0040
            SWP_NOACTIVATE = 0x0010
            user32.SetWindowPos(hwnd, HWND_TOPMOST, x, y, w, h, SWP_SHOWWINDOW | SWP_NOACTIVATE)
            log_debug(f"Fixed overlay geometry maintained at ({x}, {y}, {w}, {h})")
    except Exception as e:
        log_debug(f"Notch geometry notice: {e}")


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

        hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
        if not hwnd:
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
        if hwnd:
            GWL_STYLE = -16
            GWL_EXSTYLE = -20
            WS_CAPTION = 0x00C00000
            WS_THICKFRAME = 0x00040000
            WS_BORDER = 0x00800000
            WS_DLGFRAME = 0x00400000
            WS_POPUP = 0x80000000
            WS_EX_TOOLWINDOW = 0x00000080
            WS_EX_APPWINDOW = 0x00040000
            WS_EX_TOPMOST = 0x00000008

            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
            style &= ~(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME)
            style |= WS_POPUP
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, style)

            ex_style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            ex_style |= (WS_EX_TOOLWINDOW | WS_EX_TOPMOST)
            ex_style &= ~(WS_EX_APPWINDOW | 0x00080000)
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style)

            # Windows 11 DWM: Disable window corner rounding & 1px border
            try:
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 33, ctypes.byref(c_int(1)), 4)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 34, ctypes.byref(c_int(0xFFFFFFFE)), 4)
            except Exception as dwm_e:
                log_debug(f"DWM attribute notice: {dwm_e}")

            if voice_overlay_window and hasattr(voice_overlay_window, "native") and voice_overlay_window.native:
                try:
                    import webview.platforms.winforms as wf
                    form = voice_overlay_window.native

                    def _apply_opaque_bg():
                        form.MinimumSize = wf.Size(0, 0)
                        form.MaximumSize = wf.Size(0, 0)
                        form.FormBorderStyle = getattr(wf.WinForms.FormBorderStyle, 'None')
                        bg = wf.Color.FromArgb(255, 255, 0, 255) if DEBUG_SHAPE else wf.Color.FromArgb(255, 10, 10, 11)
                        form.BackColor = bg
                        if hasattr(form, "webview") and form.webview is not None:
                            form.webview.DefaultBackgroundColor = bg

                    if form.InvokeRequired:
                        form.Invoke(wf.Func[wf.Type](_apply_opaque_bg))
                    else:
                        _apply_opaque_bg()
                except Exception as e:
                    log_debug(f"Form opaque background notice: {e}")

            set_notch_geometry(False)
            set_notch_region(hwnd, cur_dim["w"], cur_dim["h"])
            if DEBUG_SHAPE:
                try:
                    voice_overlay_window.evaluate_js("window.__PHOENIX_DEBUG_SHAPE__ = true;")
                except Exception:
                    pass
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
    global is_quitting, tween_cancel, hover_timer, control_server, local_server, tray_icon, main_window, voice_overlay_window
    if is_quitting:
        return
    is_quitting = True
    tween_cancel = True
    if hover_timer:
        try:
            hover_timer.cancel()
        except Exception:
            pass
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

    # 1. Vocalize activation: "System online, Sir."
    speak_system_online()

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

    # 5. Compute primary screen top-center position for fixed transparent overlay canvas
    screen_w, _ = get_screen_metrics()
    init_pill_w = OVERLAY_WIDTH
    init_pill_h = OVERLAY_HEIGHT
    init_pill_x = max(0, (screen_w - init_pill_w) // 2)
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
        background_color="#FF00FF" if DEBUG_SHAPE else "#0A0A0B",
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

    # 8. Initialize System Tray, Global Hotkey & IPC Listener
    init_system_tray(main_window, voice_overlay_window)
    threading.Thread(target=start_tray_ipc_listener, args=(main_window, voice_overlay_window), daemon=True).start()
    threading.Thread(target=start_global_hotkey_listener, daemon=True).start()

    # 9. Start pywebview event loop with Dynamic Island as primary window
    try:
        log_debug("Starting webview event loop with Dynamic Island as primary...")
        webview.start(on_window_ready, voice_overlay_window, debug=False, http_server=False)
    finally:
        shutdown()
        log_debug("========== PHOENIX DESKTOP LAUNCHER EXIT ==========")


if __name__ == "__main__":
    main()
