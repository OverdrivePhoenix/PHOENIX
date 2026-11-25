import asyncio
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from .adapters import github_client as gh
from . import live_db, live_service
from .live_security import reject_path_fields, verify_live_request

router = APIRouter(prefix="/live", dependencies=[Depends(verify_live_request)])


@router.get("/projects")
async def get_live_projects(include_excluded: bool = False):
    return live_service.build_merged_projects(include_excluded=include_excluded)


@router.get("/projects/{project_id}")
async def get_live_project_detail(project_id: str):
    data = live_service.build_merged_projects(include_excluded=True)
    for p in data["projects"]:
        if p["id"] == project_id:
            return p
    raise HTTPException(status_code=404, detail="Project not found")


@router.post("/projects/pick-folder")
async def pick_project_folder():
    return await live_service.pick_and_add_folder()


@router.post("/projects/{project_id}/open")
async def open_live_project(project_id: str, request: Request, payload: Dict[str, Any] = Body(...)):
    reject_path_fields(request, payload)
    target = str(payload.get("target") or "").strip().lower()
    if target not in {"antigravity", "folder", "github"}:
        raise HTTPException(status_code=400, detail="Invalid open target")
    res = live_service.open_project_target(project_id, target)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "Unable to open target"))
    return res


@router.post("/projects/{project_id}/exclude")
async def exclude_live_project(project_id: str, request: Request, payload: Dict[str, Any] = Body(...)):
    reject_path_fields(request, payload)
    excluded = bool(payload.get("excluded", True))
    if project_id.startswith("gh:"):
        ok = live_db.set_repo_excluded(project_id[3:], excluded)
    else:
        ok = live_db.set_project_excluded(project_id, excluded)
    if not ok:
        raise HTTPException(status_code=404, detail="Project not found")
    snap = live_service.build_merged_projects()
    live_db.broadcast_sse("snapshot", {"/live/projects": snap})
    return {"ok": True, "excluded": excluded}


@router.get("/integrations/status")
async def get_integrations_status():
    statuses = live_db.get_source_statuses()
    token_present = bool(gh.get_stored_token())
    all_data = live_service.build_merged_projects(include_excluded=True)
    prefs = live_db.get_live_setting(
        "prefs",
        {
            "ag_poll_seconds": 60,
            "gh_poll_focused_seconds": 300,
            "gh_poll_idle_seconds": 900,
            "speak_urgent": False,
            "boot_digest": True,
        },
    )
    return {
        "github_connected": token_present,
        "keyring_available": gh.secret_store() is not None,
        "source_status": statuses,
        "projects": all_data["projects"],
        "antigravity_running": all_data["antigravity_running"],
        "prefs": prefs,
    }


@router.post("/integrations/github/pat")
async def connect_github_pat(request: Request, payload: Dict[str, Any] = Body(...)):
    reject_path_fields(request, payload)
    if gh.secret_store() is None:
        raise HTTPException(status_code=503, detail="Secure token storage unavailable")
    token = str(payload.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")

    client = gh.GH(token)
    try:
        info = await client.validate_token()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Token validation failed: {exc}")
    finally:
        await client.close()

    gh.store_token(token)
    sync_res = await live_service.sync_github(force=True)
    return {
        "ok": True,
        "login": info.get("login"),
        "scopes": info.get("scopes", []),
        "sso_notice": info.get("sso_notice"),
        "sync": sync_res,
    }


@router.post("/integrations/github/device/start")
async def start_github_device(request: Request, payload: Dict[str, Any] = Body(...)):
    reject_path_fields(request, payload)
    client_id = str(payload.get("client_id") or "").strip()
    if not client_id:
        raise HTTPException(status_code=400, detail="GitHub OAuth App client_id is required")
    try:
        return await gh.start_device_flow(client_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Device flow start failed: {exc}")


@router.post("/integrations/github/device/poll")
async def poll_github_device(request: Request, payload: Dict[str, Any] = Body(...)):
    reject_path_fields(request, payload)
    client_id = str(payload.get("client_id") or "").strip()
    device_code = str(payload.get("device_code") or "").strip()
    if not client_id or not device_code:
        raise HTTPException(status_code=400, detail="client_id and device_code are required")
    res = await gh.poll_device_flow(client_id, device_code)
    if "access_token" in res:
        gh.store_token(res["access_token"])
        sync_res = await live_service.sync_github(force=True)
        return {"ok": True, "status": "connected", "sync": sync_res}
    return {"ok": False, "status": res.get("error", "authorization_pending"), "detail": res.get("error_description")}


@router.delete("/integrations/github")
async def disconnect_github():
    gh.delete_token()
    live_db.clear_repos()
    live_db.upsert_source_status(
        "github",
        state="disconnected",
        last_error=None,
        next_poll=None,
        meta={"connected": False, "login": None, "repo_count": 0},
    )
    snap = live_service.build_merged_projects()
    live_db.broadcast_sse("snapshot", {"/live/projects": snap})
    return {"ok": True}


@router.post("/sync")
async def trigger_sync(request: Request, payload: Optional[Dict[str, Any]] = Body(default=None)):
    reject_path_fields(request, payload)
    source = str((payload or {}).get("source") or "all").lower()
    out: Dict[str, Any] = {}
    if source in {"all", "antigravity"}:
        out["antigravity"] = await live_service.sync_antigravity(force=True)
    if source in {"all", "github"}:
        out["github"] = await live_service.sync_github(force=True)
    return out


@router.get("/events")
async def get_live_events(limit: int = 100):
    return {"events": live_db.list_events(limit=min(max(1, limit), 500))}


@router.post("/events/{event_id}/seen")
async def mark_live_event_seen(event_id: int):
    ok = live_db.mark_event_seen(event_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


@router.post("/settings")
async def update_live_prefs(request: Request, payload: Dict[str, Any] = Body(...)):
    reject_path_fields(request, payload)
    cur = live_db.get_live_setting("prefs", {})
    allowed_keys = {"ag_poll_seconds", "gh_poll_focused_seconds", "gh_poll_idle_seconds", "speak_urgent", "boot_digest"}
    for k in allowed_keys:
        if k in payload:
            cur[k] = payload[k]
    live_db.set_live_setting("prefs", cur)
    return {"ok": True, "prefs": cur}


@router.get("/stream")
async def live_sse_stream(request: Request):
    q = live_db.subscribe_sse()

    async def event_gen():
        try:
            initial_snap = {"/live/projects": live_service.build_merged_projects()}
            yield f"event: snapshot\ndata: {json.dumps(initial_snap)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev_name, data = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"event: {ev_name}\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            live_db.unsubscribe_sse(q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
