import asyncio
import logging
import os
import shutil
import subprocess
import webbrowser
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from .adapters import antigravity as ag
from .adapters import github_client as gh
from . import live_db, live_events

_GH_CLIENT: Optional[gh.GH] = None
_GH_CLIENT_TOKEN: Optional[str] = None


def _get_gh_client(token: str) -> gh.GH:
    global _GH_CLIENT, _GH_CLIENT_TOKEN
    if _GH_CLIENT is None or _GH_CLIENT_TOKEN != token:
        _GH_CLIENT = gh.GH(token)
        _GH_CLIENT_TOKEN = token
    return _GH_CLIENT


def _next_poll_iso(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def build_merged_projects(include_excluded: bool = False) -> Dict[str, Any]:
    local_projects = live_db.list_db_projects(include_excluded=include_excluded)
    repos = live_db.list_db_repos(include_excluded=include_excluded)
    statuses = live_db.get_source_statuses()

    repo_by_nwo: Dict[str, Dict[str, Any]] = {
        r["nameWithOwner"].lower(): r for r in repos if r.get("nameWithOwner")
    }
    matched_repos = set()
    merged: List[Dict[str, Any]] = []

    for p in local_projects:
        nwo = (p.get("remote_repo") or "").lower()
        repo = repo_by_nwo.get(nwo) if nwo else None
        if repo:
            matched_repos.add(nwo)

        # Strip local_path before returning to renderer
        merged.append(
            {
                "id": p["id"],
                "name": p["name"],
                "source_kind": "linked" if repo else "local",
                "seen_in": p.get("seen_in", []),
                "is_manual": p.get("is_manual", False),
                "excluded": p.get("excluded", False),
                "last_opened": p.get("last_opened") or 0,
                "branch": p.get("branch"),
                "dirty_count": p.get("dirty_count", 0),
                "ahead": p.get("ahead", 0),
                "behind": p.get("behind", 0),
                "last_commit": p.get("last_commit"),
                "remote_repo": p.get("remote_repo"),
                "github": repo,
                "updated_at": p.get("updated_at"),
            }
        )

    for r in repos:
        nwo = (r.get("nameWithOwner") or "").lower()
        if nwo in matched_repos:
            continue
        merged.append(
            {
                "id": f"gh:{r['nameWithOwner']}",
                "name": r["nameWithOwner"].split("/")[-1],
                "source_kind": "github",
                "seen_in": [],
                "is_manual": False,
                "excluded": r.get("excluded", False),
                "last_opened": 0,
                "branch": r.get("defaultBranch"),
                "dirty_count": 0,
                "ahead": 0,
                "behind": 0,
                "last_commit": (
                    {
                        "sha": (r.get("headOid") or "")[:7],
                        "message": r.get("headMessage"),
                        "date": r.get("headCommittedAt"),
                    }
                    if r.get("headOid")
                    else None
                ),
                "remote_repo": r["nameWithOwner"],
                "github": r,
                "updated_at": r.get("updated_at"),
            }
        )

    return {
        "projects": merged,
        "antigravity_running": ag.is_antigravity_running(),
        "source_status": statuses,
    }


async def sync_antigravity(force: bool = False) -> Dict[str, Any]:
    try:
        prev_projects = {p["id"]: p for p in live_db.list_db_projects(include_excluded=True)}
        items, meta = await asyncio.to_thread(ag.scan_workspaces, force)
        if items is not None:
            live_db.upsert_projects(items, clear_non_manual=True)
        # Refresh git state for manual projects too
        manual_items = [p for p in live_db.list_db_projects(include_excluded=True) if p.get("is_manual")]
        if manual_items and force:
            refreshed = []
            for mp in manual_items:
                lp = mp.get("local_path")
                if lp and os.path.isdir(lp):
                    gi = await asyncio.to_thread(ag.inspect_git_repo, lp)
                    mp.update(gi)
                    refreshed.append(mp)
            if refreshed:
                live_db.upsert_projects(refreshed, clear_non_manual=False)

        cur_projects = live_db.list_db_projects(include_excluded=False)
        candidates = live_events.diff_local_projects(prev_projects, cur_projects)
        emitted = live_events.record_transition_events("antigravity", candidates)

        now = live_db.utc_now_iso()
        state = "live" if meta.get("roots") or cur_projects else "disconnected"
        live_db.upsert_source_status(
            "antigravity",
            state=state,
            last_ok=now,
            last_error=None,
            next_poll=_next_poll_iso(60),
            meta=meta,
        )
        snap = build_merged_projects()
        live_db.broadcast_sse("snapshot", {"/live/projects": snap, "/live/summary": build_live_summary()})
        return {"ok": True, "meta": meta, "state": state, "events": emitted}
    except Exception as exc:
        ag.log_ag(f"sync error: {exc!r}")
        statuses = live_db.get_source_statuses()
        has_prev = bool(statuses.get("antigravity", {}).get("last_ok"))
        live_db.upsert_source_status(
            "antigravity",
            state="stale" if has_prev else "error",
            last_error=str(exc),
            next_poll=_next_poll_iso(60),
        )
        return {"ok": False, "error": str(exc)}


async def sync_github(force: bool = False) -> Dict[str, Any]:
    token = gh.get_stored_token()
    if not token:
        live_db.upsert_source_status(
            "github",
            state="disconnected",
            last_error=None,
            next_poll=None,
            meta={"connected": False, "login": None},
        )
        return {"ok": False, "state": "disconnected"}

    client = _get_gh_client(token)
    try:
        prev_repos = {r["nameWithOwner"].lower(): r for r in live_db.list_db_repos(include_excluded=True)}
        info = await client.validate_token()
        sweep = await client.sweep_repos()
        live_db.upsert_repos(sweep["repos"])
        cur_repos = live_db.list_db_repos(include_excluded=False)
        candidates = live_events.diff_repos(prev_repos, cur_repos)
        emitted = live_events.record_transition_events("github", candidates)
        now = live_db.utc_now_iso()
        meta = {
            "connected": True,
            "login": sweep.get("login") or info.get("login"),
            "scopes": info.get("scopes", []),
            "sso_notice": info.get("sso_notice"),
            "rate_remaining": sweep.get("rate_remaining"),
            "rate_reset": sweep.get("rate_reset"),
            "repo_count": len(sweep["repos"]),
        }
        live_db.upsert_source_status(
            "github",
            state="live",
            last_ok=now,
            last_error=info.get("sso_notice"),
            next_poll=_next_poll_iso(300),
            meta=meta,
        )
        snap = build_merged_projects()
        live_db.broadcast_sse("snapshot", {"/live/projects": snap, "/live/summary": build_live_summary()})
        return {"ok": True, "state": "live", "meta": meta, "events": emitted}
    except gh.BackoffError as exc:
        gh.log_gh(f"backoff: {exc}")
        statuses = live_db.get_source_statuses()
        has_prev = bool(statuses.get("github", {}).get("last_ok"))
        live_db.upsert_source_status(
            "github",
            state="stale" if has_prev else "error",
            last_error=str(exc),
            next_poll=_next_poll_iso(min(1800, max(60, exc.retry_after))),
        )
        return {"ok": False, "state": "stale" if has_prev else "error", "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        msg = f"GitHub HTTP {code}"
        if code == 401:
            msg = "GitHub token rejected (401 Unauthorized). Please reconnect."
        elif code == 403:
            msg = "GitHub access forbidden (403). Check token permissions or org SSO approval."
        gh.log_gh(f"http error: {msg}")
        live_db.upsert_source_status(
            "github",
            state="error",
            last_error=msg,
            next_poll=_next_poll_iso(900),
        )
        return {"ok": False, "state": "error", "error": msg}
    except httpx.RequestError as exc:
        msg = f"Network unreachable: {type(exc).__name__}"
        gh.log_gh(f"network error: {msg}")
        statuses = live_db.get_source_statuses()
        has_prev = bool(statuses.get("github", {}).get("last_ok"))
        live_db.upsert_source_status(
            "github",
            state="stale" if has_prev else "error",
            last_error=msg,
            next_poll=_next_poll_iso(300),
        )
        snap = build_merged_projects()
        live_db.broadcast_sse("snapshot", {"/live/projects": snap})
        return {"ok": False, "state": "stale" if has_prev else "error", "error": msg}
    except Exception as exc:
        gh.log_gh(f"unexpected error: {exc!r}")
        live_db.upsert_source_status(
            "github",
            state="error",
            last_error=str(exc),
            next_poll=_next_poll_iso(900),
        )
        return {"ok": False, "state": "error", "error": str(exc)}


def open_project_target(project_id: str, target: str) -> Dict[str, Any]:
    if target == "github":
        if project_id.startswith("gh:"):
            nwo = project_id[3:]
            url = f"https://github.com/{nwo}"
        else:
            p = live_db.get_db_project(project_id)
            if not p or not p.get("remote_repo"):
                return {"ok": False, "error": "No GitHub repository linked"}
            url = f"https://github.com/{p['remote_repo']}"
        webbrowser.open(url)
        return {"ok": True}

    p = live_db.get_db_project(project_id)
    if not p:
        return {"ok": False, "error": "Local project not found"}
    local_path = p.get("local_path")
    if not local_path or not os.path.isdir(local_path):
        return {"ok": False, "error": "Local folder no longer exists"}

    if target == "folder":
        os.startfile(local_path)
        return {"ok": True}

    if target == "antigravity":
        for exe in ("antigravity", "antigravity.cmd", "code", "code.cmd"):
            found = shutil.which(exe)
            if found:
                subprocess.Popen([found, local_path], shell=False)
                return {"ok": True}
        os.startfile(local_path)
        return {"ok": True, "fallback": "folder"}

    return {"ok": False, "error": f"Unknown target: {target}"}


def _pick_folder_sync() -> Optional[str]:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(title="Add Project Folder to PHOENIX")
        root.destroy()
        return os.path.normpath(selected) if selected else None
    except Exception as exc:
        logging.warning(f"[ag] folder picker failed: {exc!r}")
        return None


async def pick_and_add_folder() -> Dict[str, Any]:
    folder = await asyncio.to_thread(_pick_folder_sync)
    if not folder or not os.path.isdir(folder):
        return {"ok": False, "cancelled": True}

    pid = ag.project_id_for_path(folder)
    gi = await asyncio.to_thread(ag.inspect_git_repo, folder)
    item = {
        "id": pid,
        "name": os.path.basename(folder) or folder,
        "path_hash": pid,
        "local_path": folder,
        "seen_in": ["Manual"],
        "last_opened": datetime.now(timezone.utc).timestamp(),
        "branch": gi["branch"],
        "dirty_count": gi["dirty_count"],
        "ahead": gi["ahead"],
        "behind": gi["behind"],
        "last_commit": gi["last_commit"],
        "remote_repo": gi["remote_repo"],
        "is_manual": True,
    }
    live_db.upsert_projects([item], clear_non_manual=False)
    ag.log_ag(f"Manually added project id={pid} name={item['name']}")
    snap = build_merged_projects()
    live_db.broadcast_sse("snapshot", {"/live/projects": snap, "/live/summary": build_live_summary()})
    return {"ok": True, "project_id": pid, "name": item["name"]}


def build_live_summary() -> Dict[str, Any]:
    merged = build_merged_projects(include_excluded=False)
    projects = merged["projects"]
    events = live_db.list_events(limit=100)
    unseen_attention = [e for e in events if not e.get("seen") and e.get("severity") in {"attention", "urgent"}]
    open_prs = sum(int((p.get("github") or {}).get("openPrsCount") or 0) for p in projects)
    ci_failing = sum(1 for p in projects if (p.get("github") or {}).get("ciState") in {"FAILURE", "ERROR"})
    need_attention = len(unseen_attention) + ci_failing
    most_active = projects[0] if projects else None
    statuses = merged["source_status"]
    last_ok_times = [s.get("last_ok") for s in statuses.values() if s.get("last_ok")]
    return {
        "projects_tracked": len(projects),
        "need_attention": need_attention,
        "open_prs": open_prs,
        "ci_failing": ci_failing,
        "most_active_project": most_active["name"] if most_active else None,
        "most_active_branch": most_active.get("branch") if most_active else None,
        "last_sync": max(last_ok_times) if last_ok_times else None,
        "antigravity_running": merged["antigravity_running"],
        "source_status": statuses,
    }


async def test_github_connection() -> Dict[str, Any]:
    token = gh.get_stored_token()
    if not token:
        return {"ok": False, "error": "Not connected. Store a token first.", "missing_permissions": []}
    client = _get_gh_client(token)
    missing: List[str] = []
    try:
        info = await client.validate_token()
    except httpx.HTTPStatusError as exc:
        return {"ok": False, "error": f"Token rejected (HTTP {exc.response.status_code})", "missing_permissions": ["user:read"]}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "missing_permissions": []}

    try:
        sweep = await client.sweep_repos()
        return {
            "ok": True,
            "login": sweep.get("login") or info.get("login"),
            "repo_count": len(sweep.get("repos") or []),
            "rate_remaining": sweep.get("rate_remaining"),
            "scopes": info.get("scopes", []),
            "sso_notice": info.get("sso_notice"),
            "missing_permissions": [],
        }
    except Exception as exc:
        msg = str(exc)
        low = msg.lower()
        for perm in ("contents", "pull requests", "issues", "actions", "checks", "metadata"):
            if perm in low:
                missing.append(perm)
        if not missing and ("403" in msg or "accessible" in low or "scope" in low):
            missing = ["Metadata (read)", "Contents (read)", "Pull requests (read)", "Issues (read)", "Actions/Checks (read)"]
        return {
            "ok": False,
            "login": info.get("login"),
            "repo_count": 0,
            "rate_remaining": info.get("rate_remaining"),
            "missing_permissions": missing,
            "error": msg,
        }
