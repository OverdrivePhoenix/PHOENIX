import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from . import live_db


def log_event(msg: str):
    try:
        logging.info(f"[event] {msg}")
        if getattr(sys, "frozen", False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        with open(os.path.join(app_dir, "phoenix_runtime.txt"), "a", encoding="utf-8") as f:
            f.write(f"[event] {msg}\n")
    except Exception:
        pass


def _parse_iso_age_hours(iso_str: Optional[str]) -> Optional[float]:
    if not iso_str:
        return None
    try:
        s = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
    except Exception:
        return None


def diff_repos(
    prev_repos: Dict[str, Dict[str, Any]],
    cur_repos: List[Dict[str, Any]],
) -> List[Tuple[str, str, str, Optional[str], str, Dict[str, Any]]]:
    """
    Compare previous and current GitHub repo snapshots.
    Yields (source, kind, severity, project_id, dedupe_key, payload).
    """
    events: List[Tuple[str, str, str, Optional[str], str, Dict[str, Any]]] = []
    for r in cur_repos:
        nwo = r.get("nameWithOwner")
        if not nwo:
            continue
        pid = f"gh:{nwo}"
        prev = prev_repos.get(nwo.lower())

        # 1. Default branch CI failing -> urgent
        ci = r.get("ciState")
        prev_ci = prev.get("ciState") if prev else None
        if ci in {"FAILURE", "ERROR"} and ci != prev_ci:
            oid = (r.get("headOid") or "head")[:7]
            events.append((
                "github",
                "ci_failed",
                "urgent",
                pid,
                f"ci_failed:{nwo}:default:{oid}:{ci}",
                {
                    "repo": nwo,
                    "branch": r.get("defaultBranch"),
                    "state": ci,
                    "message": f"{nwo} default branch CI {ci.lower()} ({oid})",
                },
            ))

        # 2. New commit on default branch -> info
        oid = r.get("headOid")
        prev_oid = prev.get("headOid") if prev else None
        if prev and oid and prev_oid and oid != prev_oid:
            events.append((
                "github",
                "commit_pushed",
                "info",
                pid,
                f"commit_pushed:{nwo}:default:{oid[:7]}",
                {
                    "repo": nwo,
                    "branch": r.get("defaultBranch"),
                    "sha": oid[:7],
                    "message": f"{nwo}: {r.get('headMessage') or 'New commit on ' + (r.get('defaultBranch') or 'main')}",
                },
            ))

        # 3. Open issue count change -> info
        issues = int(r.get("openIssuesCount") or 0)
        prev_issues = int(prev.get("openIssuesCount") or 0) if prev else issues
        if prev and issues != prev_issues:
            events.append((
                "github",
                "issues_changed",
                "info",
                pid,
                f"issues_changed:{nwo}:{issues}",
                {
                    "repo": nwo,
                    "count": issues,
                    "delta": issues - prev_issues,
                    "message": f"{nwo}: open issues {prev_issues} -> {issues}",
                },
            ))

        # 4. Pull requests: new, review requested/changes requested, approved+green, CI failing, stale > 7d
        prev_prs = {pr["number"]: pr for pr in (prev.get("openPrs") or [])} if prev else {}
        for pr in r.get("openPrs") or []:
            num = pr.get("number")
            if num is None:
                continue
            p_pr = prev_prs.get(num)
            pr_ci = pr.get("ciState")
            rd = pr.get("reviewDecision")

            if p_pr is None and prev is not None:
                events.append((
                    "github",
                    "pr_opened",
                    "attention",
                    pid,
                    f"pr_opened:{nwo}:{num}:open",
                    {
                        "repo": nwo,
                        "number": num,
                        "title": pr.get("title"),
                        "message": f"{nwo} #{num} opened: {pr.get('title')}",
                    },
                ))

            if pr_ci in {"FAILURE", "ERROR"} and (p_pr is None or p_pr.get("ciState") != pr_ci):
                events.append((
                    "github",
                    "pr_ci_failed",
                    "attention",
                    pid,
                    f"pr_ci_failed:{nwo}:{num}:{pr_ci}",
                    {
                        "repo": nwo,
                        "number": num,
                        "title": pr.get("title"),
                        "message": f"{nwo} #{num} CI {pr_ci.lower()}: {pr.get('title')}",
                    },
                ))

            if rd == "CHANGES_REQUESTED" and (p_pr is None or p_pr.get("reviewDecision") != rd):
                events.append((
                    "github",
                    "pr_changes_requested",
                    "attention",
                    pid,
                    f"pr_changes:{nwo}:{num}:{rd}",
                    {
                        "repo": nwo,
                        "number": num,
                        "title": pr.get("title"),
                        "message": f"{nwo} #{num} changes requested: {pr.get('title')}",
                    },
                ))

            if rd == "APPROVED" and pr_ci == "SUCCESS":
                if p_pr is None or p_pr.get("reviewDecision") != "APPROVED" or p_pr.get("ciState") != "SUCCESS":
                    events.append((
                        "github",
                        "pr_ready_to_merge",
                        "attention",
                        pid,
                        f"pr_ready:{nwo}:{num}:approved_green",
                        {
                            "repo": nwo,
                            "number": num,
                            "title": pr.get("title"),
                            "message": f"{nwo} #{num} approved and green (ready to merge)",
                        },
                    ))

            age_h = _parse_iso_age_hours(pr.get("updatedAt"))
            if age_h is not None and age_h > 24 * 7:
                events.append((
                    "github",
                    "pr_stale",
                    "attention",
                    pid,
                    f"pr_stale:{nwo}:{num}:7d",
                    {
                        "repo": nwo,
                        "number": num,
                        "title": pr.get("title"),
                        "message": f"{nwo} #{num} stale (>7 days without update)",
                    },
                ))
    return events


def diff_local_projects(
    prev_projects: Dict[str, Dict[str, Any]],
    cur_projects: List[Dict[str, Any]],
) -> List[Tuple[str, str, str, Optional[str], str, Dict[str, Any]]]:
    events: List[Tuple[str, str, str, Optional[str], str, Dict[str, Any]]] = []
    for p in cur_projects:
        pid = p.get("id")
        if not pid:
            continue
        prev = prev_projects.get(pid)
        name = p.get("name") or pid
        behind = int(p.get("behind") or 0)
        prev_behind = int(prev.get("behind") or 0) if prev else 0
        if prev and behind > 0 and prev_behind == 0:
            events.append((
                "antigravity",
                "local_behind",
                "info",
                pid,
                f"local_behind:{pid}:{behind}",
                {
                    "project": name,
                    "branch": p.get("branch"),
                    "behind": behind,
                    "message": f"{name} ({p.get('branch') or 'HEAD'}) is {behind} commit(s) behind upstream",
                },
            ))

        lc_date = (p.get("last_commit") or {}).get("date")
        age_h = _parse_iso_age_hours(lc_date)
        dirty = int(p.get("dirty_count") or 0)
        ahead = int(p.get("ahead") or 0)
        if age_h is not None and age_h > 24:
            if dirty > 0:
                events.append((
                    "antigravity",
                    "local_dirty_24h",
                    "attention",
                    pid,
                    f"local_dirty_24h:{pid}:{dirty}",
                    {
                        "project": name,
                        "dirty_count": dirty,
                        "message": f"{name} has {dirty} uncommitted change(s) (>24h)",
                    },
                ))
            if ahead > 0:
                events.append((
                    "antigravity",
                    "local_unpushed_24h",
                    "attention",
                    pid,
                    f"local_unpushed_24h:{pid}:{ahead}",
                    {
                        "project": name,
                        "ahead": ahead,
                        "message": f"{name} has {ahead} unpushed commit(s) (>24h)",
                    },
                ))
    return events


def record_transition_events(
    source: str,
    candidates: List[Tuple[str, str, str, Optional[str], str, Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """
    If baseline for `source` is not yet established, mark baseline silently and emit 0 events.
    Otherwise insert deduped events and broadcast over SSE.
    """
    baseline_key = f"baseline_done:{source}"
    if not live_db.get_live_setting(baseline_key, False):
        live_db.set_live_setting(baseline_key, True)
        log_event(f"baseline recorded silently for source={source} (0 events emitted)")
        return []

    emitted: List[Dict[str, Any]] = []
    for src, kind, severity, project_id, dedupe_key, payload in candidates:
        ev = live_db.insert_event(
            source=src,
            kind=kind,
            severity=severity,
            project_id=project_id,
            payload=payload,
            dedupe_key=dedupe_key,
        )
        if ev is not None:
            emitted.append(ev)
            live_db.broadcast_sse("event", ev)
            log_event(f"emitted id={ev['id']} severity={severity} key={dedupe_key}")
    return emitted


def build_boot_digest() -> Dict[str, Any]:
    """Template-driven digest of top 3 items by severity from REAL data (no LLM)."""
    prefs = live_db.get_live_setting("prefs", {})
    if prefs.get("boot_digest") is False:
        return {"enabled": False, "text": "", "items": []}

    repos = live_db.list_db_repos(include_excluded=False)
    items: List[Tuple[int, str]] = []  # (priority_rank, sentence)

    failing_repos = [r for r in repos if r.get("ciState") in {"FAILURE", "ERROR"}]
    for r in failing_repos[:2]:
        br = r.get("defaultBranch") or "default branch"
        items.append((0, f"{r['nameWithOwner'].split('/')[-1]} has a failing check on {br}."))

    review_prs = []
    for r in repos:
        for pr in r.get("openPrs") or []:
            if not pr.get("isDraft"):
                review_prs.append((r, pr))
    if review_prs:
        n = len(review_prs)
        items.append((1, f"{n} pull request{'s are' if n != 1 else ' is'} open."))

    local_dirty = [p for p in live_db.list_db_projects(include_excluded=False) if int(p.get("dirty_count") or 0) > 0]
    if local_dirty:
        n = len(local_dirty)
        items.append((2, f"{n} local workspace{'s have' if n != 1 else ' has'} uncommitted changes."))

    items.sort(key=lambda x: x[0])
    top = [s for _, s in items[:3]]
    return {"enabled": True, "text": " ".join(top), "items": top}
