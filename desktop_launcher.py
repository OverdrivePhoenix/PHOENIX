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

OVERLAY_WIDTH = 540
OVERLAY_HEIGHT = 420
active_hit_rect = [0, 0, 0, 0]


class NotchApi:
    """Direct JavaScript-to-Python bridge for 0ms latency notch hit-testing and control."""
    def set_hit_rect(self, x: int, y: int, width: int, height: int):
        global active_hit_rect
        try:
            screen_w, _ = get_screen_metrics()
            win_x = max(0, (screen_w - OVERLAY_WIDTH) // 2)
            active_hit_rect = [win_x + int(x), int(y), win_x + int(x) + int(width), int(y) + int(height)]
        except Exception:
            pass
        return True

    def set_interactive(self, interactive: bool):
        set_overlay_interactivity(interactive)
        return True

    def set_expanded(self, expanded: bool):
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


def set_overlay_interactivity(interactive: bool):
    """Toggles WS_EX_TRANSPARENT on the native overlay window so empty transparent areas pass mouse clicks through."""
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
        if not hwnd:
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
        if hwnd:
            GWL_EXSTYLE = -20
            WS_EX_TRANSPARENT = 0x00000020
            ex_style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            if interactive:
                new_style = ex_style & ~WS_EX_TRANSPARENT
            else:
                new_style = ex_style | WS_EX_TRANSPARENT
            if new_style != ex_style:
                ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, new_style)
    except Exception:
        pass


def start_hit_test_monitor():
    """Monitors cursor position against active notch element bounds to enable click pass-through."""
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        pt = wintypes.POINT()
        is_interactive_now = True

        while not is_quitting:
            if user32.GetCursorPos(ctypes.byref(pt)):
                x, y = pt.x, pt.y
                x1, y1, x2, y2 = active_hit_rect
                inside = (x1 <= x <= x2) and (y1 <= y <= y2)
                if inside and not is_interactive_now:
                    set_overlay_interactivity(True)
                    is_interactive_now = True
                elif not inside and is_interactive_now:
                    set_overlay_interactivity(False)
                    is_interactive_now = False
            time.sleep(0.025)
    except Exception as e:
        log_debug(f"Hit test monitor notice: {e}")



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
    """Strips all native window chrome, enforces DWM transparency, eliminates Win11 borders, and centers flush at primary screen top-center (y = 0)."""
    global voice_overlay_window, active_hit_rect
    try:
        import ctypes
        from ctypes import Structure, c_int

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

            # Completely strip native window border, caption, and title bar
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
            style &= ~(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME)
            style |= WS_POPUP
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, style)

            # Skip Windows taskbar and Alt+Tab, force HWND_TOPMOST; ensure WS_EX_LAYERED is NOT set (breaks WebView2 DirectComposition)
            ex_style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            ex_style |= (WS_EX_TOOLWINDOW | WS_EX_TOPMOST)
            ex_style &= ~(WS_EX_APPWINDOW | 0x00080000)
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style)

            # Extend DWM glass sheet across the entire window client area
            class MARGINS(Structure):
                _fields_ = [
                    ("cxLeftWidth", c_int),
                    ("cxRightWidth", c_int),
                    ("cyTopHeight", c_int),
                    ("cyBottomHeight", c_int),
                ]
            margins = MARGINS(-1, -1, -1, -1)
            ctypes.windll.dwmapi.DwmExtendFrameIntoClientArea(hwnd, ctypes.byref(margins))

            # Windows 11 DWM: Disable window corner rounding (DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_DONOTROUND = 1)
            try:
                DWMWA_WINDOW_CORNER_PREFERENCE = 33
                donotround = c_int(1)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ctypes.byref(donotround), 4)
            except Exception as dwm_e:
                log_debug(f"DWM corner preference notice: {dwm_e}")

            # Windows 11 DWM: Remove 1px border (DWMWA_BORDER_COLOR = 34, DWMWA_COLOR_NONE = 0xFFFFFFFE)
            try:
                DWMWA_BORDER_COLOR = 34
                color_none = c_int(0xFFFFFFFE)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, ctypes.byref(color_none), 4)
            except Exception as dwm_e2:
                log_debug(f"DWM border color notice: {dwm_e2}")

            # Apply transparent backing canvas to WinForms Form
            if voice_overlay_window and hasattr(voice_overlay_window, "native") and voice_overlay_window.native:
                try:
                    import webview.platforms.winforms as wf
                    form = voice_overlay_window.native
                    form.MinimumSize = wf.Size(0, 0)
                    form.MaximumSize = wf.Size(0, 0)
                    form.SetStyle(wf.WinForms.ControlStyles.SupportsTransparentBackColor, True)
                    form.BackColor = wf.Color.Transparent
                except Exception as e:
                    log_debug(f"Form BackColor transparency notice: {e}")

            # Fixed dimensions anchored flush at top-center (y = 0)
            set_notch_geometry(False)

            # Initialize idle hit rect: centered 200px wide, 34px tall flush at y = 0
            screen_w, _ = get_screen_metrics()
            win_x = max(0, (screen_w - OVERLAY_WIDTH) // 2)
            offset_x = (OVERLAY_WIDTH - 200) // 2
            active_hit_rect = [win_x + offset_x, 0, win_x + offset_x + 200, 36]
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
    global is_quitting, control_server, local_server, tray_icon, main_window, voice_overlay_window
    if is_quitting:
        return
    is_quitting = True
    log_debug("Shutting down PHOENIX background services and exiting...")
    if control_server:
        control_server.should_exit = True
    if local_server:
        local_server.should_exit = True
    if tray_icon:
        try:
            tray_icon.stop()
        except Exception:
            pass
    if voice_overlay_window:
        try:
            voice_overlay_window.destroy()
        except Exception:
            pass
    if main_window:
        try:
            main_window.destroy()
        except Exception:
            pass
    # Forceful process tree termination so nothing lingers
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
    # Dynamic Island overlay window is the ONLY visible window at launch (fixed transparent canvas)
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
        transparent=True,
        background_color="#00000000",
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

    # 8. Initialize System Tray, Global Hotkey, Hit-Test Monitor & IPC Listener
    init_system_tray(main_window, voice_overlay_window)
    threading.Thread(target=start_tray_ipc_listener, args=(main_window, voice_overlay_window), daemon=True).start()
    threading.Thread(target=start_global_hotkey_listener, daemon=True).start()
    threading.Thread(target=start_hit_test_monitor, daemon=True).start()

    # 9. Start pywebview event loop with Dynamic Island as primary window
    try:
        log_debug("Starting webview event loop with Dynamic Island as primary...")
        webview.start(on_window_ready, voice_overlay_window, debug=False, http_server=False)
    finally:
        shutdown()
        log_debug("========== PHOENIX DESKTOP LAUNCHER EXIT ==========")


if __name__ == "__main__":
    main()
