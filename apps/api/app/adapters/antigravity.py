import hashlib
import json
import logging
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse
from typing import Any, Dict, List, Optional, Set, Tuple

import psutil

_LAST_MTIME_SIG: Optional[Tuple[Tuple[str, float], ...]] = None


def log_ag(msg: str):
    try:
        logging.info(f"[ag] {msg}")
        if getattr(sys, "frozen", False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        diag_file = os.path.join(app_dir, "phoenix_runtime.txt")
        with open(diag_file, "a", encoding="utf-8") as f:
            f.write(f"[ag] {msg}\n")
    except Exception:
        pass


def roots() -> List[pathlib.Path]:
    ad = os.environ.get("APPDATA", "")
    if not ad:
        return []
    return [
        p
        for n in ("Antigravity IDE", "Antigravity")
        if (p := pathlib.Path(ad) / n / "User").exists()
    ]


def uri_to_path(u: str) -> Optional[str]:
    if not isinstance(u, str):
        return None
    p = urllib.parse.urlparse(u)
    if p.scheme != "file":
        return None
    s = urllib.parse.unquote(p.path)
    if re.match(r"^/[A-Za-z]:", s):
        s = s[1:]
    return os.path.normpath(s)


def _walk(o: Any, out: Set[str]):
    """Schema-agnostic collector for file:/// URIs anywhere in JSON."""
    if isinstance(o, dict):
        for v in o.values():
            _walk(v, out)
    elif isinstance(o, list):
        for v in o:
            _walk(v, out)
    elif isinstance(o, str) and o.startswith("file:///"):
        out.add(o)


def normalize_win_path(p: str) -> str:
    return os.path.normcase(os.path.normpath(p))


def project_id_for_path(p: str) -> str:
    norm = normalize_win_path(p)
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()[:12]


def _git(path: str, *args: str, t: int = 4) -> Optional[str]:
    try:
        kwargs: Dict[str, Any] = {
            "capture_output": True,
            "text": True,
            "timeout": t,
            "shell": False,
        }
        if os.name == "nt":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        r = subprocess.run(["git", "--no-optional-locks", "-C", path, *args], **kwargs)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def parse_github_owner_repo(remote_url: Optional[str]) -> Optional[str]:
    if not remote_url:
        return None
    u = remote_url.strip()
    # https://github.com/owner/repo.git or ssh://git@github.com/owner/repo.git or git@github.com:owner/repo.git
    m = re.search(r"github\.com[:/]([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?/?$", u)
    return m.group(1) if m else None


def inspect_git_repo(path: str) -> Dict[str, Any]:
    branch = _git(path, "rev-parse", "--abbrev-ref", "HEAD")
    if branch is None:
        return {
            "is_git": False,
            "branch": None,
            "dirty_count": 0,
            "ahead": 0,
            "behind": 0,
            "last_commit": None,
            "remote_repo": None,
        }

    porcelain = _git(path, "status", "--porcelain")
    dirty_count = len([ln for ln in porcelain.splitlines() if ln.strip()]) if porcelain else 0

    ahead = 0
    behind = 0
    ab = _git(path, "rev-list", "--left-right", "--count", "@{u}...HEAD")
    if ab:
        parts = ab.split()
        if len(parts) == 2:
            try:
                behind = int(parts[0])
                ahead = int(parts[1])
            except ValueError:
                pass

    last_commit = None
    lc = _git(path, "log", "-1", "--format=%h|%s|%cI")
    if lc and "|" in lc:
        parts = lc.split("|", 2)
        if len(parts) == 3:
            last_commit = {"sha": parts[0], "message": parts[1], "date": parts[2]}

    remote_url = _git(path, "remote", "get-url", "origin")
    remote_repo = parse_github_owner_repo(remote_url)

    return {
        "is_git": True,
        "branch": branch,
        "dirty_count": dirty_count,
        "ahead": ahead,
        "behind": behind,
        "last_commit": last_commit,
        "remote_repo": remote_repo,
    }


def is_antigravity_running() -> bool:
    try:
        for proc in psutil.process_iter(["name"]):
            name = (proc.info.get("name") or "").lower()
            if "antigravity" in name:
                return True
    except Exception:
        pass
    return False


def _compute_mtime_signature(found_roots: List[pathlib.Path]) -> Tuple[Tuple[str, float], ...]:
    sig: List[Tuple[str, float]] = []
    for r in found_roots:
        sj = r / "globalStorage" / "storage.json"
        if sj.exists():
            sig.append((str(sj), sj.stat().st_mtime))
        ws = r / "workspaceStorage"
        if ws.exists():
            sig.append((str(ws), ws.stat().st_mtime))
            for d in ws.iterdir():
                wj = d / "workspace.json"
                if wj.exists():
                    sig.append((str(wj), wj.stat().st_mtime))
    return tuple(sorted(sig))


def scan_workspaces(force: bool = False) -> Tuple[Optional[List[Dict[str, Any]]], Dict[str, Any]]:
    """
    Read-only scan of Antigravity IDE / Antigravity User storage.
    Returns (projects_list_or_None_if_unchanged, meta_dict).
    Never writes to storage.json or state.vscdb, and never reads .pb files.
    """
    global _LAST_MTIME_SIG
    found_roots = roots()
    meta: Dict[str, Any] = {
        "roots": [str(r.parent.name) for r in found_roots],
        "antigravity_running": is_antigravity_running(),
        "parsed_workspaces": 0,
        "existing_folders": 0,
    }
    if not found_roots:
        log_ag("No Antigravity User roots found under %APPDATA%")
        return [], meta

    sig = _compute_mtime_signature(found_roots)
    if not force and _LAST_MTIME_SIG is not None and sig == _LAST_MTIME_SIG:
        return None, {**meta, "skipped_unchanged": True}

    found: Dict[str, Dict[str, Any]] = {}  # norm_case_path -> info
    parsed_count = 0

    for root in found_roots:
        uris: Set[str] = set()
        gs = root / "globalStorage" / "storage.json"
        if gs.exists():
            try:
                _walk(json.loads(gs.read_text("utf-8")), uris)
            except Exception as e:
                log_ag(f"storage.json unreadable: {e!r}")

        ws = root / "workspaceStorage"
        if ws.exists():
            for d in ws.iterdir():
                wj = d / "workspace.json"
                if wj.exists():
                    try:
                        j = json.loads(wj.read_text("utf-8"))
                        u = j.get("folder")
                        if u:
                            parsed_count += 1
                            uris.add(u)
                            p = uri_to_path(u)
                            if p:
                                nk = normalize_win_path(p)
                                entry = found.setdefault(nk, {"raw_path": p, "seen_in": set(), "last_opened": 0.0})
                                entry["last_opened"] = max(entry["last_opened"], d.stat().st_mtime)
                    except Exception as e:
                        log_ag(f"{wj.name} unreadable: {e!r}")

        for u in uris:
            p = uri_to_path(u)
            if p and os.path.isdir(p):
                nk = normalize_win_path(p)
                entry = found.setdefault(nk, {"raw_path": p, "seen_in": set(), "last_opened": 0.0})
                entry["seen_in"].add(root.parent.name)

    results: List[Dict[str, Any]] = []
    for nk, info in found.items():
        raw_path = info["raw_path"]
        if not os.path.isdir(raw_path):
            continue
        pid = project_id_for_path(raw_path)
        git_info = inspect_git_repo(raw_path)
        results.append(
            {
                "id": pid,
                "name": os.path.basename(raw_path) or raw_path,
                "path_hash": pid,
                "local_path": raw_path,
                "seen_in": sorted(info["seen_in"]),
                "last_opened": info["last_opened"],
                "branch": git_info["branch"],
                "dirty_count": git_info["dirty_count"],
                "ahead": git_info["ahead"],
                "behind": git_info["behind"],
                "last_commit": git_info["last_commit"],
                "remote_repo": git_info["remote_repo"],
                "is_manual": False,
            }
        )

    _LAST_MTIME_SIG = sig
    meta["parsed_workspaces"] = parsed_count
    meta["existing_folders"] = len(results)
    log_ag(
        f"roots={meta['roots']} parsed_ws={parsed_count} existing={len(results)} running={meta['antigravity_running']}"
    )
    return results, meta
