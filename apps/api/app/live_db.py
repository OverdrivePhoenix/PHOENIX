import asyncio
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .settings_store import get_data_dir

_DB_LOCK = threading.Lock()
_SSE_SUBSCRIBERS: List[asyncio.Queue] = []


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_live_db_path() -> str:
    return os.path.join(get_data_dir(), "phoenix_live.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_live_db_path(), check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_live_db():
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    path_hash TEXT NOT NULL,
                    local_path TEXT NOT NULL,
                    seen_in_json TEXT NOT NULL DEFAULT '[]',
                    last_opened REAL DEFAULT 0,
                    branch TEXT,
                    dirty_count INTEGER DEFAULT 0,
                    ahead INTEGER DEFAULT 0,
                    behind INTEGER DEFAULT 0,
                    last_commit_json TEXT,
                    remote_repo TEXT,
                    is_manual INTEGER DEFAULT 0,
                    excluded INTEGER DEFAULT 0,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS repos (
                    name_with_owner TEXT PRIMARY KEY,
                    is_private INTEGER DEFAULT 0,
                    pushed_at TEXT,
                    url TEXT,
                    default_branch TEXT,
                    head_oid TEXT,
                    head_message TEXT,
                    head_committed_at TEXT,
                    ci_state TEXT,
                    open_prs_count INTEGER DEFAULT 0,
                    open_prs_json TEXT NOT NULL DEFAULT '[]',
                    open_issues_count INTEGER DEFAULT 0,
                    excluded INTEGER DEFAULT 0,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    data_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    source TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    project_id TEXT,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    dedupe_key TEXT UNIQUE NOT NULL,
                    seen INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS source_status (
                    source TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    last_ok TEXT,
                    last_error TEXT,
                    next_poll TEXT,
                    meta_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE TABLE IF NOT EXISTS live_settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL
                );
                """
            )
            now = utc_now_iso()
            for src, default_state in (("antigravity", "disconnected"), ("github", "disconnected")):
                conn.execute(
                    """
                    INSERT OR IGNORE INTO source_status (source, state, last_ok, last_error, next_poll, meta_json)
                    VALUES (?, ?, NULL, NULL, NULL, '{}')
                    """,
                    (src, default_state),
                )
            conn.commit()
        finally:
            conn.close()


def upsert_source_status(
    source: str,
    state: str,
    last_ok: Optional[str] = None,
    last_error: Optional[str] = None,
    next_poll: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
):
    with _DB_LOCK:
        conn = _connect()
        try:
            cur = conn.execute("SELECT last_ok, meta_json FROM source_status WHERE source = ?", (source,)).fetchone()
            prev_ok = cur["last_ok"] if cur else None
            prev_meta = json.loads(cur["meta_json"]) if (cur and cur["meta_json"]) else {}
            merged_meta = {**prev_meta, **(meta or {})}
            conn.execute(
                """
                INSERT INTO source_status (source, state, last_ok, last_error, next_poll, meta_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(source) DO UPDATE SET
                    state = excluded.state,
                    last_ok = COALESCE(excluded.last_ok, source_status.last_ok),
                    last_error = excluded.last_error,
                    next_poll = excluded.next_poll,
                    meta_json = excluded.meta_json
                """,
                (
                    source,
                    state,
                    last_ok if last_ok is not None else prev_ok,
                    last_error,
                    next_poll,
                    json.dumps(merged_meta),
                ),
            )
            conn.commit()
        finally:
            conn.close()


def get_source_statuses() -> Dict[str, Dict[str, Any]]:
    with _DB_LOCK:
        conn = _connect()
        try:
            rows = conn.execute("SELECT * FROM source_status").fetchall()
            out: Dict[str, Dict[str, Any]] = {}
            for r in rows:
                out[r["source"]] = {
                    "source": r["source"],
                    "state": r["state"],
                    "last_ok": r["last_ok"],
                    "last_error": r["last_error"],
                    "next_poll": r["next_poll"],
                    "meta": json.loads(r["meta_json"] or "{}"),
                }
            return out
        finally:
            conn.close()


def upsert_projects(items: List[Dict[str, Any]], clear_non_manual: bool = True):
    now = utc_now_iso()
    with _DB_LOCK:
        conn = _connect()
        try:
            existing_rows = conn.execute("SELECT id, is_manual, excluded FROM projects").fetchall()
            excluded_map = {r["id"]: int(r["excluded"] or 0) for r in existing_rows}
            manual_ids = {r["id"] for r in existing_rows if r["is_manual"]}

            seen_ids = set()
            for item in items:
                pid = item["id"]
                seen_ids.add(pid)
                is_manual = 1 if (item.get("is_manual") or pid in manual_ids) else 0
                excluded = excluded_map.get(pid, 0)
                conn.execute(
                    """
                    INSERT INTO projects (
                        id, name, path_hash, local_path, seen_in_json, last_opened,
                        branch, dirty_count, ahead, behind, last_commit_json,
                        remote_repo, is_manual, excluded, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        seen_in_json = excluded.seen_in_json,
                        last_opened = CASE WHEN excluded.last_opened > 0 THEN excluded.last_opened ELSE projects.last_opened END,
                        branch = excluded.branch,
                        dirty_count = excluded.dirty_count,
                        ahead = excluded.ahead,
                        behind = excluded.behind,
                        last_commit_json = excluded.last_commit_json,
                        remote_repo = excluded.remote_repo,
                        is_manual = MAX(projects.is_manual, excluded.is_manual),
                        updated_at = excluded.updated_at
                    """,
                    (
                        pid,
                        item["name"],
                        item["path_hash"],
                        item["local_path"],
                        json.dumps(item.get("seen_in", [])),
                        float(item.get("last_opened") or 0),
                        item.get("branch"),
                        int(item.get("dirty_count") or 0),
                        int(item.get("ahead") or 0),
                        int(item.get("behind") or 0),
                        json.dumps(item.get("last_commit")) if item.get("last_commit") else None,
                        item.get("remote_repo"),
                        is_manual,
                        excluded,
                        now,
                    ),
                )

            if clear_non_manual:
                for r in existing_rows:
                    if not r["is_manual"] and r["id"] not in seen_ids:
                        conn.execute("DELETE FROM projects WHERE id = ?", (r["id"],))
            conn.commit()
        finally:
            conn.close()


def list_db_projects(include_excluded: bool = False) -> List[Dict[str, Any]]:
    with _DB_LOCK:
        conn = _connect()
        try:
            q = "SELECT * FROM projects" + ("" if include_excluded else " WHERE excluded = 0") + " ORDER BY last_opened DESC, name ASC"
            rows = conn.execute(q).fetchall()
            out = []
            for r in rows:
                out.append(
                    {
                        "id": r["id"],
                        "name": r["name"],
                        "path_hash": r["path_hash"],
                        "local_path": r["local_path"],
                        "seen_in": json.loads(r["seen_in_json"] or "[]"),
                        "last_opened": r["last_opened"],
                        "branch": r["branch"],
                        "dirty_count": r["dirty_count"],
                        "ahead": r["ahead"],
                        "behind": r["behind"],
                        "last_commit": json.loads(r["last_commit_json"]) if r["last_commit_json"] else None,
                        "remote_repo": r["remote_repo"],
                        "is_manual": bool(r["is_manual"]),
                        "excluded": bool(r["excluded"]),
                        "updated_at": r["updated_at"],
                    }
                )
            return out
        finally:
            conn.close()


def get_db_project(project_id: str) -> Optional[Dict[str, Any]]:
    with _DB_LOCK:
        conn = _connect()
        try:
            r = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            if not r:
                return None
            return {
                "id": r["id"],
                "name": r["name"],
                "path_hash": r["path_hash"],
                "local_path": r["local_path"],
                "seen_in": json.loads(r["seen_in_json"] or "[]"),
                "last_opened": r["last_opened"],
                "branch": r["branch"],
                "dirty_count": r["dirty_count"],
                "ahead": r["ahead"],
                "behind": r["behind"],
                "last_commit": json.loads(r["last_commit_json"]) if r["last_commit_json"] else None,
                "remote_repo": r["remote_repo"],
                "is_manual": bool(r["is_manual"]),
                "excluded": bool(r["excluded"]),
                "updated_at": r["updated_at"],
            }
        finally:
            conn.close()


def set_project_excluded(project_id: str, excluded: bool) -> bool:
    with _DB_LOCK:
        conn = _connect()
        try:
            cur = conn.execute("UPDATE projects SET excluded = ? WHERE id = ?", (1 if excluded else 0, project_id))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def upsert_repos(items: List[Dict[str, Any]]):
    now = utc_now_iso()
    with _DB_LOCK:
        conn = _connect()
        try:
            existing = conn.execute("SELECT name_with_owner, excluded FROM repos").fetchall()
            excluded_map = {r["name_with_owner"]: int(r["excluded"] or 0) for r in existing}
            seen = set()
            for item in items:
                nwo = item["nameWithOwner"]
                seen.add(nwo)
                conn.execute(
                    """
                    INSERT INTO repos (
                        name_with_owner, is_private, pushed_at, url, default_branch,
                        head_oid, head_message, head_committed_at, ci_state,
                        open_prs_count, open_prs_json, open_issues_count, excluded, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(name_with_owner) DO UPDATE SET
                        is_private = excluded.is_private,
                        pushed_at = excluded.pushed_at,
                        url = excluded.url,
                        default_branch = excluded.default_branch,
                        head_oid = excluded.head_oid,
                        head_message = excluded.head_message,
                        head_committed_at = excluded.head_committed_at,
                        ci_state = excluded.ci_state,
                        open_prs_count = excluded.open_prs_count,
                        open_prs_json = excluded.open_prs_json,
                        open_issues_count = excluded.open_issues_count,
                        updated_at = excluded.updated_at
                    """,
                    (
                        nwo,
                        1 if item.get("isPrivate") else 0,
                        item.get("pushedAt"),
                        item.get("url"),
                        item.get("defaultBranch"),
                        item.get("headOid"),
                        item.get("headMessage"),
                        item.get("headCommittedAt"),
                        item.get("ciState"),
                        int(item.get("openPrsCount") or 0),
                        json.dumps(item.get("openPrs") or []),
                        int(item.get("openIssuesCount") or 0),
                        excluded_map.get(nwo, 0),
                        now,
                    ),
                )
            for r in existing:
                if r["name_with_owner"] not in seen:
                    conn.execute("DELETE FROM repos WHERE name_with_owner = ?", (r["name_with_owner"],))
            conn.commit()
        finally:
            conn.close()


def clear_repos():
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute("DELETE FROM repos")
            conn.commit()
        finally:
            conn.close()


def list_db_repos(include_excluded: bool = False) -> List[Dict[str, Any]]:
    with _DB_LOCK:
        conn = _connect()
        try:
            q = "SELECT * FROM repos" + ("" if include_excluded else " WHERE excluded = 0") + " ORDER BY pushed_at DESC"
            rows = conn.execute(q).fetchall()
            out = []
            for r in rows:
                out.append(
                    {
                        "nameWithOwner": r["name_with_owner"],
                        "isPrivate": bool(r["is_private"]),
                        "pushedAt": r["pushed_at"],
                        "url": r["url"],
                        "defaultBranch": r["default_branch"],
                        "headOid": r["head_oid"],
                        "headMessage": r["head_message"],
                        "headCommittedAt": r["head_committed_at"],
                        "ciState": r["ci_state"],
                        "openPrsCount": r["open_prs_count"],
                        "openPrs": json.loads(r["open_prs_json"] or "[]"),
                        "openIssuesCount": r["open_issues_count"],
                        "excluded": bool(r["excluded"]),
                        "updated_at": r["updated_at"],
                    }
                )
            return out
        finally:
            conn.close()


def set_repo_excluded(name_with_owner: str, excluded: bool) -> bool:
    with _DB_LOCK:
        conn = _connect()
        try:
            cur = conn.execute(
                "UPDATE repos SET excluded = ? WHERE LOWER(name_with_owner) = LOWER(?)",
                (1 if excluded else 0, name_with_owner),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def insert_event(
    source: str,
    kind: str,
    severity: str,
    project_id: Optional[str],
    payload: Dict[str, Any],
    dedupe_key: str,
) -> Optional[Dict[str, Any]]:
    now = utc_now_iso()
    with _DB_LOCK:
        conn = _connect()
        try:
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO events (ts, source, kind, severity, project_id, payload_json, dedupe_key, seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (now, source, kind, severity, project_id, json.dumps(payload), dedupe_key),
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
            row_id = cur.lastrowid
            return {
                "id": row_id,
                "ts": now,
                "source": source,
                "kind": kind,
                "severity": severity,
                "project_id": project_id,
                "payload": payload,
                "dedupe_key": dedupe_key,
                "seen": False,
            }
        finally:
            conn.close()


def list_events(limit: int = 100) -> List[Dict[str, Any]]:
    with _DB_LOCK:
        conn = _connect()
        try:
            rows = conn.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [
                {
                    "id": r["id"],
                    "ts": r["ts"],
                    "source": r["source"],
                    "kind": r["kind"],
                    "severity": r["severity"],
                    "project_id": r["project_id"],
                    "payload": json.loads(r["payload_json"] or "{}"),
                    "dedupe_key": r["dedupe_key"],
                    "seen": bool(r["seen"]),
                }
                for r in rows
            ]
        finally:
            conn.close()


def mark_event_seen(event_id: int) -> bool:
    with _DB_LOCK:
        conn = _connect()
        try:
            cur = conn.execute("UPDATE events SET seen = 1 WHERE id = ?", (event_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def get_live_setting(key: str, default: Any = None) -> Any:
    with _DB_LOCK:
        conn = _connect()
        try:
            r = conn.execute("SELECT value_json FROM live_settings WHERE key = ?", (key,)).fetchone()
            return json.loads(r["value_json"]) if r else default
        finally:
            conn.close()


def set_live_setting(key: str, value: Any):
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO live_settings (key, value_json) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
                """,
                (key, json.dumps(value)),
            )
            conn.commit()
        finally:
            conn.close()


def subscribe_sse() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _SSE_SUBSCRIBERS.append(q)
    return q


def unsubscribe_sse(q: asyncio.Queue):
    if q in _SSE_SUBSCRIBERS:
        _SSE_SUBSCRIBERS.remove(q)


def broadcast_sse(event_name: str, data: Any):
    msg = (event_name, data)
    for q in list(_SSE_SUBSCRIBERS):
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass
