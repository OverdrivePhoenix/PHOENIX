import io
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from .config import settings
from .firestore_db import db
from .policy_engine import PolicyEngine
from .agents.jarvis import JarvisVoiceButler
from .agents.planner import generate_plan
from .tts import tts_manager
from .schemas import (
    AgentRead,
    ApprovalCreate,
    ApprovalDecisionRequest,
    ApprovalRead,
    EmergencyPauseRequest,
    EmergencyPauseResponse,
    ExecutionLogRead,
    JarvisBriefingResponse,
    JarvisVoiceCommandRequest,
    JarvisVoiceCommandResponse,
    PlanRequest,
    PlanResult,
    ProjectCreate,
    ProjectRead,
    TaskRead,
    TaskUpdate
)

_is_emergency_paused = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.initialize()
    yield

app = FastAPI(
    title="Project PHOENIX Cloud Control Plane",
    description="Autonomous AI Software Engineering Organization with Google Cloud Firestore and J.A.R.V.I.S. Butler Voice Engine",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "phoenix-control-plane",
        "database": "google-cloud-firestore",
        "voice_engine": "jarvis-british-butler",
        "emergency_paused": _is_emergency_paused
    }

# ==================== PROJECTS ====================

@app.post("/projects", response_model=ProjectRead, status_code=201)
async def create_project(payload: ProjectCreate):
    proj = await db.create_project(
        name=payload.name,
        description=payload.description,
        goal=payload.goal,
        repo_url=payload.repo_url
    )
    return proj

@app.get("/projects", response_model=list[ProjectRead])
async def list_projects():
    return await db.list_projects()

@app.get("/projects/{project_id}", response_model=ProjectRead)
async def get_project(project_id: str):
    p = await db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found in Firestore")
    return p

@app.post("/projects/{project_id}/plan", response_model=PlanResult)
async def plan_project(project_id: str, payload: PlanRequest):
    if _is_emergency_paused:
        raise HTTPException(423, "Execution is currently locked by Emergency Pause, Sir.")
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    existing_tasks = await db.list_tasks(project_id)
    existing_count = len(existing_tasks)

    try:
        summary = await generate_plan(project_id, project["name"], payload.goal)
    except Exception as exc:
        raise HTTPException(502, f"J.A.R.V.I.S. planner failed: {type(exc).__name__}") from exc

    current_tasks = await db.list_tasks(project_id)
    new_count = max(0, len(current_tasks) - existing_count)

    return PlanResult(
        project_id=project_id,
        summary=summary,
        tasks_created=new_count,
        tasks=[TaskRead(**t) for t in current_tasks]
    )

# ==================== TASKS ====================

@app.get("/projects/{project_id}/tasks", response_model=list[TaskRead])
async def list_tasks(project_id: str):
    tasks = await db.list_tasks(project_id)
    return [TaskRead(**t) for t in tasks]

@app.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(task_id: str, payload: TaskUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = await db.update_task(task_id, updates)
    if not updated:
        raise HTTPException(404, "Task not found")
    return TaskRead(**updated)

# ==================== APPROVALS ====================

@app.post("/projects/{project_id}/approvals", response_model=ApprovalRead, status_code=201)
async def create_approval(project_id: str, payload: ApprovalCreate):
    token, expires_at = PolicyEngine.generate_approval_token(
        action=payload.action,
        payload=payload.action_payload
    )
    appr = await db.create_approval(
        project_id=project_id,
        action=payload.action,
        rationale=payload.rationale,
        risk_level=payload.risk_level,
        rollback_plan=payload.rollback_plan,
        action_payload=payload.action_payload,
        approval_token=token,
        expires_at=expires_at
    )
    return ApprovalRead(**appr)

@app.get("/projects/{project_id}/approvals", response_model=list[ApprovalRead])
async def list_project_approvals(project_id: str):
    items = await db.list_approvals(project_id=project_id)
    return [ApprovalRead(**a) for a in items]

@app.get("/approvals", response_model=list[ApprovalRead])
async def list_all_approvals():
    items = await db.list_approvals()
    return [ApprovalRead(**a) for a in items]

@app.post("/approvals/{approval_id}/decide", response_model=ApprovalRead)
async def decide_approval(approval_id: str, payload: ApprovalDecisionRequest):
    approvals = await db.list_approvals()
    matched = next((a for a in approvals if a["id"] == approval_id), None)
    if not matched:
        raise HTTPException(404, "Approval record not found")

    if matched["status"] != "pending":
        raise HTTPException(409, f"Approval has already been resolved as {matched['status']}")

    # Cryptographic token verification
    is_valid = PolicyEngine.verify_approval_token(
        action=matched["action"],
        payload=matched["action_payload"],
        token=payload.approval_token
    )
    if not is_valid:
        raise HTTPException(403, "Cryptographic token verification failed or token has expired, Sir.")

    updated = await db.update_approval(
        approval_id=approval_id,
        status=payload.decision,
        channel=payload.channel
    )
    await db.add_execution_log(
        project_id=matched["project_id"],
        agent_id="chief_orchestrator",
        level="info" if payload.decision == "approved" else "warn",
        event_type="approval_decided",
        message=f"Action '{matched['action']}' {payload.decision.upper()} via {payload.channel}."
    )
    return ApprovalRead(**updated)

# ==================== AGENTS ====================

@app.get("/agents", response_model=list[AgentRead])
async def list_agents():
    agents = await db.list_agents()
    return [AgentRead(**a) for a in agents]

# ==================== ACTIVITY & AUDIT ====================

@app.get("/activity", response_model=list[ExecutionLogRead])
async def get_activity(project_id: Optional[str] = Query(None), limit: int = Query(50, ge=1, le=200)):
    logs = await db.list_execution_logs(project_id=project_id, limit=limit)
    return [ExecutionLogRead(**l) for l in logs]

# ==================== SWAPPABLE TTS PROVIDERS ====================

@app.get("/api/tts/providers")
async def get_tts_providers():
    return tts_manager.get_providers_info()

@app.post("/api/tts/providers/active")
async def set_active_tts_provider(payload: dict):
    tts_manager.set_active_config(
        provider_id=payload.get("provider_id", "edge_tts"),
        voice_id=payload.get("voice_id"),
        tone=payload.get("tone"),
        api_keys=payload.get("api_keys")
    )
    return {"status": "ok", "config": tts_manager.get_providers_info()}

@app.post("/api/tts/synthesize")
async def synthesize_speech(payload: dict):
    text = payload.get("text", "")
    tone = payload.get("tone", "calm_concise")
    provider_id = payload.get("provider_id")
    voice_id = payload.get("voice_id")

    res = await tts_manager.synthesize(text=text, provider_id=provider_id, voice_id=voice_id, tone=tone)
    if not res.audio_bytes:
        return {"status": "client_synthesis_required", "clean_text": res.clean_text}

    return StreamingResponse(
        io.BytesIO(res.audio_bytes),
        media_type=res.media_type,
        headers={
            "X-TTS-Provider": res.provider,
            "X-TTS-Voice": res.voice,
            "Content-Disposition": "inline; filename=speech.mp3"
        }
    )

@app.get("/api/tts/test")
async def test_tts_audio(tone: str = Query("calm_concise")):
    res = await tts_manager.synthesize(
        text="All systems online and nominal, Sir. Voice engine is operating with zero latency.",
        tone=tone
    )
    return StreamingResponse(
        io.BytesIO(res.audio_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=test.mp3"}
    )

# ==================== J.A.R.V.I.S. BUTLER ====================

@app.get("/jarvis/tones")
async def list_jarvis_tones():
    return {
        "tones": [
            {
                "key": k,
                "name": v["name"],
                "persona": v["persona"],
                "description": v["description"],
                "pitch": v["pitch"],
                "rate": v["rate"],
                "sample_phrase": v["sample_phrase"],
                "preferred_voice_keywords": v["preferred_voice_keywords"]
            }
            for k, v in JarvisVoiceButler.TONE_PRESETS.items()
        ],
        "default_tone": "calm_concise"
    }

@app.get("/jarvis/preview")
async def get_jarvis_preview(tone: str = Query("calm_concise")):
    config = JarvisVoiceButler.get_tone_config(tone)
    return {
        "tone": tone,
        "name": config["name"],
        "pitch": config["pitch"],
        "rate": config["rate"],
        "sample_phrase": config["sample_phrase"],
        "preferred_voice_keywords": config["preferred_voice_keywords"]
    }

@app.get("/jarvis/briefing", response_model=JarvisBriefingResponse)
async def get_jarvis_briefing(project_id: Optional[str] = None, tone: str = Query("calm_concise")):
    projects = await db.list_projects()
    project_name = projects[0]["name"] if projects else "Default Project"
    tasks = await db.list_tasks(projects[0]["id"]) if projects else []
    completed = len([t for t in tasks if t.get("status") == "done"])
    pending = len([t for t in tasks if t.get("status") in {"in_progress", "backlog"}])
    script = JarvisVoiceButler.generate_routine_briefing(
        project_name=project_name,
        completed_tasks=completed,
        pending_tasks=pending,
        api_spend=18.42,
        tone=tone
    )
    return JarvisBriefingResponse(
        salutation=JarvisVoiceButler.SALUTATION,
        voice_name=settings.jarvis_voice_name,
        script=script,
        system_status="Nominal" if not _is_emergency_paused else "Emergency Paused",
        emergency_paused=_is_emergency_paused,
        tone=tone
    )

@app.post("/jarvis/command", response_model=JarvisVoiceCommandResponse)
async def handle_jarvis_command(payload: JarvisVoiceCommandRequest):
    global _is_emergency_paused
    tone_used = payload.tone or "calm_concise"
    parsed = JarvisVoiceButler.parse_voice_response(payload.transcript, tone=tone_used)
    action_taken = None
    if parsed["intent"] == "emergency_pause":
        _is_emergency_paused = True
        action_taken = "emergency_pause_engaged"
    elif parsed["intent"] == "approve":
        # Check for pending approvals
        approvals = await db.list_approvals()
        pending = [a for a in approvals if a.get("status") == "pending"]
        if pending:
            top_appr = pending[0]
            await db.update_approval(top_appr["id"], "approved", channel="voice_call")
            action_taken = f"approved_{top_appr['id']}"

    return JarvisVoiceCommandResponse(
        intent=parsed["intent"],
        spoken_reply=parsed["message"],
        action_taken=action_taken,
        tone_used=tone_used
    )

# ==================== EMERGENCY PAUSE ====================

@app.post("/emergency-pause", response_model=EmergencyPauseResponse)
async def set_emergency_pause(payload: EmergencyPauseRequest):
    global _is_emergency_paused
    _is_emergency_paused = payload.paused
    msg = (
        "Emergency halt engaged. All container processes and agent threads have been frozen, Sir."
        if _is_emergency_paused
        else "Execution resumed. The autonomous engineering fleet is operating nominally, Sir."
    )
    return EmergencyPauseResponse(emergency_paused=_is_emergency_paused, message=msg)

# ==================== TRAY & OVERLAY IPC ====================
_restore_window_event = False
_toggle_overlay_event = False
_overlay_is_interactive = True
_notch_expanded_event = None
_exit_app_event = False

@app.post("/tray/restore-window")
async def request_restore_window():
    global _restore_window_event
    _restore_window_event = True
    return {"status": "ok", "action": "restore_window_requested"}

@app.post("/overlay/toggle")
async def toggle_overlay_window():
    global _toggle_overlay_event
    _toggle_overlay_event = True
    return {"status": "ok", "action": "toggle_overlay_requested"}

@app.post("/overlay/resize")
async def resize_overlay_route(payload: dict):
    global _notch_expanded_event
    expanded = payload.get("expanded", False)
    _notch_expanded_event = expanded
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
        if not hwnd:
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
        if hwnd:
            screen_w = ctypes.windll.user32.GetSystemMetrics(0)
            w = 420 if expanded else 220
            h = 290 if expanded else 38
            x = (screen_w - w) // 2
            ctypes.windll.user32.SetWindowPos(hwnd, -1, x, 0, w, h, 0x0040 | 0x0010)
    except Exception:
        pass
    return {"status": "ok", "expanded": expanded}

@app.post("/tray/exit")
async def exit_app_route():
    global _exit_app_event
    _exit_app_event = True
    return {"status": "ok", "action": "exit_requested"}

@app.post("/overlay/interactive")
async def set_overlay_interactive_route(payload: dict):
    global _overlay_is_interactive
    interactive = payload.get("interactive", True)
    _overlay_is_interactive = interactive
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Notch")
        if not hwnd:
            hwnd = ctypes.windll.user32.FindWindowW(None, "PHOENIX Voice Overlay")
        if hwnd:
            GWL_EXSTYLE = -20
            WS_EX_TRANSPARENT = 0x00000020
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            if interactive:
                style &= ~WS_EX_TRANSPARENT
            else:
                style |= WS_EX_TRANSPARENT
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
    except Exception:
        pass
    return {"status": "ok", "interactive": _overlay_is_interactive}

@app.get("/tray/events")
async def check_tray_events():
    global _restore_window_event, _toggle_overlay_event, _notch_expanded_event, _exit_app_event
    should_restore = _restore_window_event
    should_toggle = _toggle_overlay_event
    expanded = _notch_expanded_event
    should_exit = _exit_app_event
    _restore_window_event = False
    _toggle_overlay_event = False
    _notch_expanded_event = None
    _exit_app_event = False
    return {
        "should_restore": should_restore,
        "should_toggle_overlay": should_toggle,
        "overlay_interactive": _overlay_is_interactive,
        "notch_expanded": expanded,
        "should_exit": should_exit
    }

# ==================== STATIC DASHBOARD ASSETS ====================
import sys
import os
from fastapi.staticfiles import StaticFiles

_bundle_root = getattr(sys, '_MEIPASS', os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

_possible_dist_paths = [
    os.path.join(_bundle_root, "apps", "dashboard", "dist"),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../apps/dashboard/dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../dashboard_dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "dist")),
    os.path.abspath(os.path.join(os.getcwd(), "apps", "dashboard", "dist")),
    os.path.abspath(os.path.join(os.getcwd(), "..", "apps", "dashboard", "dist")),
]

_static_dist = next((p for p in _possible_dist_paths if p and os.path.isdir(p)), None)
if _static_dist:
    app.mount("/", StaticFiles(directory=_static_dist, html=True), name="static")

