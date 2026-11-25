import pathlib
import re
import subprocess
import sys
import time

import httpx
import psutil

exe = pathlib.Path("dist/PHOENIX.exe").resolve()
base = "http://127.0.0.1:8000"


def die(msg: str):
    print("SMOKE FAIL:", msg)
    sys.exit(1)


if not exe.exists():
    die(f"Missing {exe}")

# Ensure port 8000 is not held by a stale PHOENIX process
for proc in psutil.process_iter(["pid", "name"]):
    if (proc.info.get("name") or "").lower() == "phoenix.exe":
        die(f"Existing PHOENIX.exe running (pid={proc.info['pid']}); close it first")

p = subprocess.Popen([str(exe)], cwd=str(exe.parent))
try:
    r = None
    for _ in range(80):
        try:
            r = httpx.get(base + "/", timeout=1.0)
            break
        except Exception:
            time.sleep(0.5)
    if r is None:
        die("server never came up in 40 s")

    m = re.search(r'<meta[^>]*name="phoenix-session"[^>]*content="([^"]+)"', r.text)
    if not m:
        die("session meta tag missing from served index.html")

    H = {"X-Phoenix-Session": m.group(1), "Origin": base}
    for path, want in [
        ("/health", 200),
        ("/api/settings", 200),
        ("/api/tts/providers", 200),
        ("/live/projects", 200),
        ("/live/integrations/status", 200),
    ]:
        x = httpx.get(base + path, headers=H, timeout=10.0)
        print(path, x.status_code)
        if x.status_code != want:
            die(f"{path} -> {x.status_code}")

    if httpx.get(base + "/live/projects", headers={"Origin": base}, timeout=5.0).status_code != 401:
        die("session gate not enforced")

    prov = httpx.get(base + "/api/tts/providers", headers=H, timeout=5.0).json()
    if not prov or not prov.get("providers"):
        die("no TTS providers returned")

    log = (exe.parent / "phoenix_runtime.txt").read_text(encoding="utf-8", errors="ignore")[-30000:]
    if "Traceback" in log:
        die("Traceback in runtime log")

    print("SMOKE OK")
finally:
    subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True)
    time.sleep(1.0)
    orphans = [
        (proc.info["pid"], proc.info["name"])
        for proc in psutil.process_iter(["pid", "name"])
        if (proc.info.get("name") or "").lower() == "phoenix.exe"
    ]
    if orphans:
        die(f"Orphan PHOENIX.exe processes remain: {orphans}")
    print("ORPHAN_CHECK_OK: 0 PHOENIX.exe processes remaining")
