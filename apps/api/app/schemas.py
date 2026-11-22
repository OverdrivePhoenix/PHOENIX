from typing import Any, Optional
from pydantic import BaseModel, Field

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    goal: str = ""
    repo_url: str = ""

class ProjectRead(BaseModel):
    id: str
    name: str
    description: str
    goal: str
    repo_url: str = ""
    default_branch: str = "main"
    status: str = "active"
    created_at: str
    updated_at: str

class PlanRequest(BaseModel):
    goal: str = Field(min_length=5, max_length=8000)

class TaskRead(BaseModel):
    id: str
    project_id: str
    title: str
    description: str
    priority: str
    status: str
    assigned_agent: str
    feature_branch: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    created_at: str
    updated_at: str

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    assigned_agent: Optional[str] = None

class ApprovalCreate(BaseModel):
    action: str = Field(min_length=3, max_length=160)
    rationale: str = Field(min_length=5)
    risk_level: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    rollback_plan: str = "Auto-revert commits and restore database snapshot."
    action_payload: dict = Field(default_factory=dict)

class ApprovalRead(BaseModel):
    id: str
    project_id: str
    action: str
    rationale: str
    risk_level: str
    rollback_plan: str
    action_payload: dict
    approval_token: str
    token_expires_at: str
    status: str
    decided_at: Optional[str] = None
    decision_channel: Optional[str] = None
    created_at: str

class ApprovalDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    approval_token: str
    channel: str = "desktop_ui"

class PlanResult(BaseModel):
    project_id: str
    summary: str
    tasks_created: int
    tasks: list[TaskRead]

class AgentRead(BaseModel):
    id: str
    name: str
    role: str
    model_name: str
    status: str
    active_task_id: Optional[str] = None
    total_tokens_used: int
    success_rate: float

class ExecutionLogRead(BaseModel):
    id: str
    project_id: str
    agent_id: str
    level: str
    event_type: str
    message: str
    metadata: dict = Field(default_factory=dict)
    created_at: str

class JarvisBriefingResponse(BaseModel):
    salutation: str
    voice_name: str
    script: str
    system_status: str
    emergency_paused: bool
    tone: str = "calm_concise"

class JarvisVoiceCommandRequest(BaseModel):
    transcript: str
    context_project_id: Optional[str] = None
    tone: Optional[str] = "calm_concise"

class JarvisVoiceCommandResponse(BaseModel):
    intent: str
    spoken_reply: str
    action_taken: Optional[str] = None
    tone_used: str = "calm_concise"

class JarvisToneConfigResponse(BaseModel):
    tone: str
    name: str
    description: str
    pitch: float
    rate: float
    sample_phrase: str
    preferred_voice_keywords: list[str]

class OverlayInteractiveRequest(BaseModel):
    interactive: bool

class EmergencyPauseRequest(BaseModel):
    paused: bool
    reason: str = "Manual toggle from Command Center"

class EmergencyPauseResponse(BaseModel):
    emergency_paused: bool
    message: str
