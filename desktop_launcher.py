"""
Project PHOENIX - Standalone Desktop Launcher
Orchestrates silent background services (FastAPI Control Plane, Local Execution Node,
J.A.R.V.I.S. Voice Engine) and launches the native WebView2 Command Center window
with Windows System Tray integration and zero Command Prompt / terminal popups.
"""
import os
import sys
import time
import socket
import threading
import urllib.request
import traceback
from typing import Optional

# Prevent crashes when running without a console where sys.stdout / sys.stderr are None
if sys.stdout is None:
    try:
        sys.stdout = open(os.devnull, "w")
    except Exception:
        pass
if sys.stderr is None:
    try:
        sys.stderr = open(os.devnull, "w")
    except Exception:
        pass

# Fallback hook for frozen environment package metadata (e.g., mcp version needed by openai-agents)
try:
    import importlib.metadata
    _orig_metadata_version = importlib.metadata.version
    def _patched_metadata_version(pkg_name: str) -> str:
        try:
            return _orig_metadata_version(pkg_name)
        except importlib.metadata.PackageNotFoundError:
            if pkg_name.lower().replace("-", "_") in ["mcp", "mcp_server"]:
                return "2.3.0"
            elif pkg_name.lower().replace("-", "_") in ["openai_agents", "agents"]:
                return "0.25.0"
            raise
    importlib.metadata.version = _patched_metadata_version
except Exception:
    pass

# Ensure project paths are in sys.path
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    APP_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR = BUNDLE_DIR

LOG_FILE = os.path.join(APP_DIR, "phoenix_runtime.log")


def log_debug(msg: str):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def uncaught_exception_handler(exc_type, exc_value, exc_traceback):
    err = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
    log_debug(f"FATAL UNCAUGHT EXCEPTION:\n{err}")


sys.excepthook = uncaught_exception_handler

for path in [
    BUNDLE_DIR,
    os.path.join(BUNDLE_DIR, "apps", "api"),
]:
    if path not in sys.path:
        sys.path.insert(0, path)

from phoenix_silent_runner import get_silent_flags, run_silent, popen_silent

# Global references
control_server = None
local_server = None
tray_icon = None
main_window = None
voice_overlay_window = None
is_quitting = False


def speak_system_online():
    """Speaks 'System online, Sir' immediately upon activation via Windows SAPI."""
    def _speak():
        try:
            import win32com.client
            import pythoncom
            pythoncom.CoInitialize()
            speaker = win32com.client.Dispatch("SAPI.SpVoice")
            # Try to pick a British / UK voice if available (Iron Man butler style)
            for v in speaker.GetVoices():
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
    """Checks if a local TCP port is already open."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0


def wait_for_server(url: str, timeout: float = 12.0) -> bool:
    """Polls a URL until it responds with HTTP 200 or timeout expires."""
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
    """Starts the PHOENIX Control Plane & Static Dashboard Server in an in-process daemon thread."""
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
            access_log=False
        )
        control_server = uvicorn.Server(config)
        control_server.run()
    except Exception as e:
        log_debug(f"Control Plane Server Exception: {e}\n{traceback.format_exc()}")


def start_local_node_server(port: int = 8001):
    """Starts the PHOENIX Local Node Execution daemon bridge in an in-process daemon thread."""
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
            local_app = local_mod.app

            config = uvicorn.Config(
                app=local_app,
                host="127.0.0.1",
                port=port,
                log_level="warning",
                access_log=False
            )
            local_server = uvicorn.Server(config)
            local_server.run()
    except Exception as e:
        log_debug(f"Local Node Server Exception: {e}\n{traceback.format_exc()}")


def configure_voice_overlay_window():
    """Configures the floating voice overlay window with WS_EX_TOOLWINDOW (skipTaskbar) and topmost placement."""
    try:
        import ctypes
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

            # Strip all native title bar, borders, and window buttons
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
            style &= ~(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME)
            style |= WS_POPUP
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, style)

            # Set toolwindow so it skips the Windows taskbar and Alt+Tab
            ex_style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            ex_style |= (WS_EX_TOOLWINDOW | WS_EX_TOPMOST)
            ex_style &= ~WS_EX_APPWINDOW
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style)

            # Anchor flush at top-center of the screen (y = 0)
            user32 = ctypes.windll.user32
            screen_w = user32.GetSystemMetrics(0)
            screen_h = user32.GetSystemMetrics(1)
            w = 480
            h = 340
            x = max(0, (screen_w - w) // 2)
            y = 0  # Flush with top edge of screen

            # HWND_TOPMOST = -1, SWP_SHOWWINDOW = 0x0040, SWP_FRAMECHANGED = 0x0020
            ctypes.windll.user32.SetWindowPos(hwnd, -1, x, y, w, h, 0x0040 | 0x0020)
            log_debug(f"Configured PHOENIX Top Notch Overlay HWND={hwnd} at ({x}, {y}, {w}, {h}) [Top-Center, skipTaskbar=True, on_top=True]")
    except Exception as e:
        log_debug(f"Voice overlay setup notice: {e}")


def start_tray_ipc_listener(main_win, overlay_win):
    """Background listener that monitors IPC events to restore windows directly in-memory."""
    while not is_quitting:
        try:
            import app.main as main_mod
            if getattr(main_mod, "_restore_window_event", False):
                main_mod._restore_window_event = False
                if main_win:
                    main_win.show()
                    main_win.restore()
            if getattr(main_mod, "_toggle_overlay_event", False):
                main_mod._toggle_overlay_event = False
                if overlay_win:
                    try:
                        overlay_win.show()
                        overlay_win.restore()
                        configure_voice_overlay_window()
                    except Exception:
                        pass
        except Exception:
            pass
        time.sleep(0.15)


def init_system_tray(main_win, overlay_win):
    """Creates the Windows System Tray notification area icon and menu."""
    global tray_icon
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
            if main_win:
                main_win.show()
                main_win.restore()

        def on_toggle_voice_overlay(icon, item):
            if overlay_win:
                try:
                    overlay_win.show()
                    overlay_win.restore()
                    configure_voice_overlay_window()
                except Exception:
                    pass

        def on_open_dynamic_island(icon, item):
            if main_win:
                main_win.show()
                main_win.restore()
                try:
                    main_win.load_url("http://127.0.0.1:8000/#dynamic-island")
                except Exception:
                    pass

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
            global is_quitting
            is_quitting = True
            if tray_icon:
                tray_icon.stop()
            if overlay_win:
                try:
                    overlay_win.destroy()
                except Exception:
                    pass
            if main_win:
                try:
                    main_win.destroy()
                except Exception:
                    pass

        menu = pystray.Menu(
            pystray.MenuItem("Command Center", on_open_command_center, default=True),
            pystray.MenuItem("Dynamic Island Notch (Show/Hide)", on_toggle_voice_overlay),
            pystray.MenuItem("Voice Mode (Active/Standby)", on_toggle_voice_overlay),
            pystray.MenuItem("Emergency Pause", on_toggle_pause),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Exit PHOENIX", on_exit_app)
        )

        tray_icon = pystray.Icon(
            name="PHOENIX",
            icon=image,
            title="Project PHOENIX // Autonomous AI Organization",
            menu=menu
        )
        tray_thread = threading.Thread(target=tray_icon.run, daemon=True)
        tray_thread.start()
        log_debug("System Tray icon initialized.")
    except Exception as exc:
        log_debug(f"System Tray notice: {exc}")


def shutdown():
    """Cleanly terminates servers and removes tray icon."""
    global is_quitting, control_server, local_server, tray_icon
    if is_quitting:
        return
    is_quitting = True
    log_debug("Shutting down PHOENIX background services...")
    if control_server:
        control_server.should_exit = True
    if local_server:
        local_server.should_exit = True
    if tray_icon:
        try:
            tray_icon.stop()
        except Exception:
            pass


def on_window_ready(window):
    """Callback fired when the native WebView2 windows are displayed."""
    log_debug("Window displayed. Bringing to foreground and configuring overlay...")
    try:
        window.restore()
        window.show()
    except Exception:
        pass
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, "Project PHOENIX // Autonomous AI Engineering Organization")
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            ctypes.windll.user32.SetForegroundWindow(hwnd)
    except Exception:
        pass
    # Configure the Voice Screen Overlay window with WS_EX_TOOLWINDOW and topmost placement
    configure_voice_overlay_window()


def main():
    global main_window, voice_overlay_window
    log_debug("========== PHOENIX DESKTOP LAUNCHER START ==========")

    # 1. Immediately vocalize activation: "System online, Sir."
    speak_system_online()

    # 2. Start Control Plane (FastAPI + React Dashboard) if port 8000 is free
    if not is_port_in_use(8000):
        t1 = threading.Thread(target=start_control_plane_server, args=(8000,), daemon=True)
        t1.start()
    else:
        log_debug("Port 8000 is already in use; reusing existing server.")

    # 3. Start Local Node Daemon bridge if port 8001 is free
    if not is_port_in_use(8001):
        t2 = threading.Thread(target=start_local_node_server, args=(8001,), daemon=True)
        t2.start()

    # 4. Wait for Control Plane health endpoint
    server_ready = wait_for_server("http://127.0.0.1:8000/health", timeout=12.0)
    log_debug(f"Server ready status: {server_ready}")
    target_url = "http://127.0.0.1:8000" if server_ready else "http://localhost:5173"
    overlay_url = "http://127.0.0.1:8000/#voice-overlay" if server_ready else "http://localhost:5173/#voice-overlay"

    # 5. Launch Native Desktop Windows using pywebview (Edge WebView2)
    import webview

    main_window = webview.create_window(
        title="Project PHOENIX // Autonomous AI Engineering Organization",
        url=target_url,
        width=1440,
        height=900,
        min_size=(1080, 680),
        background_color="#0D0F12",
        text_select=True,
        zoomable=True
    )

    voice_overlay_window = webview.create_window(
        title="PHOENIX Voice Overlay",
        url=overlay_url,
        width=480,
        height=340,
        frameless=True,
        on_top=True,
        transparent=True,
        background_color="#000000",
        shadow=False,
        resizable=False,
        text_select=False,
        zoomable=False,
        easy_drag=False
    )

    # 6. Wire window events
    def on_closed():
        log_debug("Main window closed by user.")
        shutdown()

    main_window.events.closed += on_closed

    # 7. Initialize System Tray & IPC Listener
    init_system_tray(main_window, voice_overlay_window)
    threading.Thread(target=start_tray_ipc_listener, args=(main_window, voice_overlay_window), daemon=True).start()

    # 8. Start pywebview event loop (blocks until window is closed)
    try:
        log_debug("Starting webview event loop...")
        webview.start(on_window_ready, main_window, debug=False, http_server=False)
    finally:
        shutdown()
        log_debug("========== PHOENIX DESKTOP LAUNCHER EXIT ==========")


if __name__ == "__main__":
    main()
