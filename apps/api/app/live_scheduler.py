import asyncio
import logging
import os
import sys
import time
from datetime import datetime
from typing import Optional

from . import live_db, live_service

_SCHEDULER_TASK: Optional[asyncio.Task] = None
_LAST_SPOKEN_URGENT_TS: float = 0.0


def log_poll(msg: str):
    try:
        logging.info(f"[poll] {msg}")
        if getattr(sys, "frozen", False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        with open(os.path.join(app_dir, "phoenix_runtime.txt"), "a", encoding="utf-8") as f:
            f.write(f"[poll] {msg}\n")
    except Exception:
        pass


def _in_quiet_hours(start_hhmm: str = "22:00", end_hhmm: str = "08:00") -> bool:
    try:
        now = datetime.now().strftime("%H:%M")
        if start_hhmm <= end_hhmm:
            return start_hhmm <= now <= end_hhmm
        return now >= start_hhmm or now <= end_hhmm
    except Exception:
        return False


async def maybe_speak_urgent(events: list):
    global _LAST_SPOKEN_URGENT_TS
    urgent = [e for e in events if e.get("severity") == "urgent"]
    if not urgent:
        return
    prefs = live_db.get_live_setting("prefs", {})
    if not prefs.get("speak_urgent"):
        return
    if _in_quiet_hours():
        return
    now = time.monotonic()
    if now - _LAST_SPOKEN_URGENT_TS < 600:  # max 1 spoken interrupt per 10 minutes
        return
    _LAST_SPOKEN_URGENT_TS = now
    msg = urgent[0].get("payload", {}).get("message") or "Urgent repository alert."
    try:
        from .tts import tts_manager
        await tts_manager.synthesize(text=msg)
        log_poll(f"spoken urgent alert: {msg}")
    except Exception as exc:
        log_poll(f"urgent speech failed: {exc!r}")


async def _scheduler_loop():
    last_ag = 0.0
    last_gh = 0.0
    gh_backoff = 0
    log_poll("scheduler started")
    try:
        while True:
            await asyncio.sleep(5.0)
            now = time.monotonic()
            prefs = live_db.get_live_setting("prefs", {})
            ag_interval = max(15, int(prefs.get("ag_poll_seconds") or 60))

            if now - last_ag >= ag_interval:
                last_ag = now
                res = await live_service.sync_antigravity(force=False)
                if res.get("events"):
                    await maybe_speak_urgent(res["events"])

            # GitHub: 5 min if CI failing or open PRs pending, else 15 min (with backoff cap 30 min)
            statuses = live_db.get_source_statuses()
            gh_state = statuses.get("github", {}).get("state")
            if gh_state != "disconnected":
                repos = live_db.list_db_repos(include_excluded=False)
                has_pending = any(
                    r.get("ciState") in {"FAILURE", "ERROR", "PENDING"} or (r.get("openPrsCount") or 0) > 0
                    for r in repos
                )
                base_gh = int(prefs.get("gh_poll_focused_seconds") or 300) if has_pending else int(prefs.get("gh_poll_idle_seconds") or 900)
                gh_interval = min(1800, max(base_gh, gh_backoff))
                if now - last_gh >= gh_interval:
                    last_gh = now
                    res = await live_service.sync_github(force=False)
                    if res.get("ok"):
                        gh_backoff = 0
                    else:
                        gh_backoff = min(1800, max(60, (gh_backoff * 2) if gh_backoff else 120))
                    if res.get("events"):
                        await maybe_speak_urgent(res["events"])
    except asyncio.CancelledError:
        log_poll("scheduler stopped cleanly")
        raise


def start_scheduler():
    global _SCHEDULER_TASK
    if _SCHEDULER_TASK is None or _SCHEDULER_TASK.done():
        _SCHEDULER_TASK = asyncio.create_task(_scheduler_loop())


async def stop_scheduler():
    global _SCHEDULER_TASK
    if _SCHEDULER_TASK is not None and not _SCHEDULER_TASK.done():
        _SCHEDULER_TASK.cancel()
        try:
            await _SCHEDULER_TASK
        except asyncio.CancelledError:
            pass
    _SCHEDULER_TASK = None
