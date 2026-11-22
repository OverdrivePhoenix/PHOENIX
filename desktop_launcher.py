import os
import sys
import time
import socket
import urllib.request
import threading
import logging
import traceback

# Setup logging
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "phoenix_runtime.log")
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

if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    APP_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR = BUNDLE_DIR

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


class NotchApi:
    """Direct JavaScript-to-Python bridge for 0ms latency notch geometry changes."""
    def set_expanded(self, expanded: bool):
        set_notch_geometry(expanded)
        return True

    def toggle_visibility(self):
        toggle_notch_overlay()
        return True


def speak_system_online():
    """Vocalizes 'System online, Sir.' via Windows SAPI / Edge-TTS."""
    def _speak():
        try:
            try:
                import edge_tts
                import asyncio
                import tempfile
                import winsound

                async def _edge_synth():
                    comm = edge_tts.Communicate("System online, Sir.", voice="en-GB-RyanNeural")
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fp:
                        temp_path = fp.name
                    await comm.save(temp_path)
                    return temp_path

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                wav_file = loop.run_until_complete(_edge_synth())
                winsound.PlaySound(wav_file, winsound.SND_FILENAME | winsound.SND_ASYNC)
                log_debug("Spoke 'System online, Sir.' via Edge-TTS successfully.")
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
    with socket.socket(socket.AF_INET, socket.STREAM) as s:
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
            access_log=False
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
                    access_log=False
                )
                local_server = uvicorn.Server(config)
                local_server.run()
    except Exception as e:
        log_debug(f"Local Node Server Exception: {e}\n{traceback.format_exc()}")


def set_notch_geometry(expanded: bool):
    """Dynamically resizes and centers the native notch overlay window at y = 0."""
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
        if not hwnd:
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
        if hwnd:
            user32 = ctypes.windll.user32
            screen_w = user32.GetSystemMetrics(0)
            w = 420 if expanded else 220
            h = 290 if expanded else 38
            x = (screen_w - w) // 2
            y = 0
            # HWND_TOPMOST = -1, SWP_SHOWWINDOW = 0x0040, SWP_NOACTIVATE = 0x0010
            user32.SetWindowPos(hwnd, -1, x, y, w, h, 0x0040 | 0x0010)
            log_debug(f"Notch geometry set: expanded={expanded}, at ({x}, {y}, {w}, {h})")
    except Exception as e:
        log_debug(f"Notch geometry error: {e}")


def configure_voice_overlay_window(expanded: bool = False):
    """Strips all native window chrome and positions flush at primary screen top-center (y = 0)."""
    try:
        import ctypes
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

            # Skip Windows taskbar and Alt+Tab, force HWND_TOPMOST
            ex_style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            ex_style |= (WS_EX_TOOLWINDOW | WS_EX_TOPMOST)
            ex_style &= ~WS_EX_APPWINDOW
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style)

            # Resize to exact dimensions and anchor at top-center (y = 0)
            set_notch_geometry(expanded)
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
            if main_win:
                main_win.show()
                main_win.restore()

        def on_toggle_notch(icon, item):
            toggle_notch_overlay()

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
            pystray.MenuItem("Command Center", on_open_command_center, default=True),
            pystray.MenuItem("Hide Notch" if notch_visible else "Show Notch", on_toggle_notch),
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


def on_window_ready(window):
    """Callback fired when the native WebView2 windows are displayed."""
    log_debug("Window displayed. Configuring notch geometry flush at top-center...")
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
    configure_voice_overlay_window(expanded=False)


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

    # 5. Compute primary screen top-center position for the notch pill
    import ctypes
    user32 = ctypes.windll.user32
    screen_w = user32.GetSystemMetrics(0)
    init_pill_w = 220
    init_pill_h = 38
    init_pill_x = max(0, (screen_w - init_pill_w) // 2)
    init_pill_y = 0

    # 6. Launch Native Desktop Windows using pywebview (Edge WebView2)
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

    notch_api = NotchApi()
    voice_overlay_window = webview.create_window(
        title="PHOENIX Notch",
        url=overlay_url,
        width=init_pill_w,
        height=init_pill_h,
        x=init_pill_x,
        y=init_pill_y,
        frameless=True,
        on_top=True,
        transparent=True,
        background_color="#000000",
        shadow=False,
        resizable=False,
        text_select=False,
        zoomable=False,
        easy_drag=False,
        js_api=notch_api
    )

    # 7. Wire window events
    def on_main_closed():
        log_debug("Main window closed by user.")
        shutdown()

    main_window.events.closed += on_main_closed
    voice_overlay_window.events.closed += on_main_closed

    # 8. Initialize System Tray & IPC Listener
    init_system_tray(main_window, voice_overlay_window)
    threading.Thread(target=start_tray_ipc_listener, args=(main_window, voice_overlay_window), daemon=True).start()

    # 9. Start pywebview event loop (blocks until window is closed)
    try:
        log_debug("Starting webview event loop...")
        webview.start(on_window_ready, main_window, debug=False, http_server=False)
    finally:
        shutdown()
        log_debug("========== PHOENIX DESKTOP LAUNCHER EXIT ==========")


if __name__ == "__main__":
    main()
