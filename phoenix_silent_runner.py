"""
PHOENIX Silent Process Runner & Execution Protocol
Enforces zero Command Prompt / terminal window popups across all child processes,
services, and CLI commands on Windows.
"""
import sys
import subprocess
from typing import Any, Dict, List, Optional, Union

# Windows Silent Execution Flags
CREATE_NO_WINDOW: int = 0x08000000
STARTF_USESHOWWINDOW: int = 0x00000001
SW_HIDE: int = 0


def get_silent_flags() -> Dict[str, Any]:
    """Returns subprocess creation flags and STARTUPINFO configured to hide all console windows on Windows."""
    kwargs: Dict[str, Any] = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = CREATE_NO_WINDOW
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = SW_HIDE
        kwargs["startupinfo"] = startupinfo
    return kwargs


def run_silent(
    cmd: Union[str, List[str]],
    *,
    capture_output: bool = True,
    text: bool = True,
    check: bool = False,
    timeout: Optional[float] = None,
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    **extra_kwargs: Any
) -> subprocess.CompletedProcess:
    """Executes a CLI command (Docker, Git, Python, npm, etc.) completely silently with zero console window popups."""
    flags = get_silent_flags()
    flags.update(extra_kwargs)
    return subprocess.run(
        cmd,
        capture_output=capture_output,
        text=text,
        check=check,
        timeout=timeout,
        cwd=cwd,
        env=env,
        **flags
    )


def popen_silent(
    cmd: Union[str, List[str]],
    *,
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    stdin: Any = subprocess.PIPE,
    stdout: Any = subprocess.PIPE,
    stderr: Any = subprocess.PIPE,
    **extra_kwargs: Any
) -> subprocess.Popen:
    """Spawns an asynchronous child process completely silently in the background."""
    flags = get_silent_flags()
    flags.update(extra_kwargs)
    return subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdin=stdin,
        stdout=stdout,
        stderr=stderr,
        **flags
    )


def kill_child_process_tree(pid: int) -> None:
    """Cleanly terminates an entire process tree without any residual orphan processes."""
    if not pid:
        return
    try:
        if sys.platform == "win32":
            # Force kill process tree silently
            run_silent(["taskkill", "/F", "/T", "/PID", str(pid)])
        else:
            import os
            import signal
            os.kill(pid, signal.SIGTERM)
    except Exception:
        pass
