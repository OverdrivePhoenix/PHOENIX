import os
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
import sys
from .config import settings

def utcnow_str() -> str:
    return datetime.now(timezone.utc).isoformat()

class FirestoreDB:
    """
    Asynchronous Firestore database manager.
    Connects to live Google Cloud Firestore / Firestore Emulator if available,
    with an automatic persistent JSON file fallback for offline local development.
    """
    def __init__(self):
        self._live_client = None
        if getattr(sys, 'frozen', False):
            base_data_dir = os.path.join(os.path.dirname(sys.executable), "data")
        else:
            base_data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
        os.makedirs(base_data_dir, exist_ok=True)
        self._fallback_file = os.path.join(base_data_dir, "local_firestore.json")
        self._memory_store = {
            "projects": {},
            "tasks": {},
            "approvals": {},
            "agents": {
                "chief_orchestrator": {
                    "id": "chief_orchestrator",
                    "name": "Chief Orchestrator",
                    "role": "Global Coordination & Triage",
                    "model_name": "gemini-2.5-flash",
                    "status": "idle",
                    "active_task_id": None,
                    "total_tokens_used": 14200,
                    "success_rate": 98.4
                },
                "project_manager": {
                    "id": "project_manager",
                    "name": "Project Manager",
                    "role": "PRD & Task Decomposition",
                    "model_name": "gemini-2.5-flash",
                    "status": "idle",
                    "active_task_id": None,
                    "total_tokens_used": 28400,
                    "success_rate": 96.2
                },
                "software_engineer": {
                    "id": "software_engineer",
                    "name": "Software Engineer",
                    "role": "Code Authoring & Refactoring",
                    "model_name": "gemini-2.5-flash",
                    "status": "idle",
                    "active_task_id": None,
                    "total_tokens_used": 89500,
                    "success_rate": 92.1
                },
                "qa_engineer": {
                    "id": "qa_engineer",
                    "name": "QA Engineer",
                    "role": "Test Execution & Bug Rejection",
                    "model_name": "gemini-2.5-flash",
                    "status": "idle",
                    "active_task_id": None,
                    "total_tokens_used": 41200,
                    "success_rate": 95.8
                },
                "security_reviewer": {
                    "id": "security_reviewer",
                    "name": "Security Reviewer",
                    "role": "Diff Audits & Secret Hygiene",
                    "model_name": "gemini-2.5-flash",
                    "status": "idle",
                    "active_task_id": None,
                    "total_tokens_used": 19800,
                    "success_rate": 99.5
                },
                "devops_engineer": {
                    "id": "devops_engineer",
                    "name": "DevOps Engineer",
                    "role": "CI/CD & Container Orchestration",
                    "model_name": "gemini-2.5-flash",
                    "status": "idle",
                    "active_task_id": None,
                    "total_tokens_used": 23100,
                    "success_rate": 94.0
                }
            },
            "execution_logs": [],
            "knowledge_documents": {}
        }
        self._load_fallback()

    def _load_fallback(self):
        try:
            if os.path.exists(self._fallback_file):
                with open(self._fallback_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._memory_store.update(data)
        except Exception:
            pass

    def _save_fallback(self):
        try:
            os.makedirs(os.path.dirname(self._fallback_file), exist_ok=True)
            with open(self._fallback_file, "w", encoding="utf-8") as f:
                json.dump(self._memory_store, f, indent=2, default=str)
        except Exception:
            pass

    async def initialize(self):
        """Attempts to connect to live Firestore or Firestore Emulator if credentials or emulator host are configured."""
        if settings.firestore_emulator_host:
            os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host
        try:
            # Only connect to live Google Cloud Firestore if credentials or emulator are provided
            if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or os.environ.get("FIRESTORE_EMULATOR_HOST"):
                from google.cloud import firestore
                self._live_client = firestore.AsyncClient(project=settings.gcp_project_id)
            else:
                self._live_client = None
        except Exception:
            self._live_client = None

    # Projects
    async def create_project(self, name: str, description: str, goal: str, repo_url: str = "") -> dict:
        project_id = str(uuid.uuid4())
        doc = {
            "id": project_id,
            "name": name,
            "description": description,
            "goal": goal,
            "repo_url": repo_url,
            "default_branch": "main",
            "status": "active",
            "created_at": utcnow_str(),
            "updated_at": utcnow_str()
        }
        if self._live_client:
            try:
                await self._live_client.collection("projects").document(project_id).set(doc)
            except Exception:
                pass
        self._memory_store["projects"][project_id] = doc
        self._save_fallback()
        await self.add_execution_log(
            project_id=project_id,
            agent_id="chief_orchestrator",
            level="info",
            event_type="project_created",
            message=f"Project '{name}' initialized with target goal: {goal[:60]}..."
        )
        return doc

    async def get_project(self, project_id: str) -> Optional[dict]:
        if self._live_client:
            try:
                snap = await self._live_client.collection("projects").document(project_id).get()
                if snap.exists:
                    return snap.to_dict()
            except Exception:
                pass
        return self._memory_store["projects"].get(project_id)

    async def list_projects(self) -> list[dict]:
        if self._live_client:
            try:
                docs = self._live_client.collection("projects").order_by("created_at", direction="DESCENDING").stream()
                results = [d.to_dict() async for d in docs]
                if results:
                    return results
            except Exception:
                pass
        return sorted(list(self._memory_store["projects"].values()), key=lambda x: x.get("created_at", ""), reverse=True)

    # Tasks
    async def create_task(self, project_id: str, title: str, description: str, priority: str, assigned_agent: str, feature_branch: str = "") -> dict:
        task_id = str(uuid.uuid4())
        doc = {
            "id": task_id,
            "project_id": project_id,
            "title": title,
            "description": description,
            "priority": priority,
            "status": "backlog",
            "assigned_agent": assigned_agent,
            "feature_branch": feature_branch or f"feat/task-{task_id[:8]}",
            "retry_count": 0,
            "max_retries": 3,
            "created_at": utcnow_str(),
            "updated_at": utcnow_str()
        }
        if self._live_client:
            try:
                await self._live_client.collection("projects").document(project_id).collection("tasks").document(task_id).set(doc)
            except Exception:
                pass
        self._memory_store["tasks"][task_id] = doc
        self._save_fallback()
        return doc

    async def list_tasks(self, project_id: str) -> list[dict]:
        if self._live_client:
            try:
                docs = self._live_client.collection("projects").document(project_id).collection("tasks").order_by("created_at").stream()
                results = [d.to_dict() async for d in docs]
                if results:
                    return results
            except Exception:
                pass
        return [t for t in self._memory_store["tasks"].values() if t.get("project_id") == project_id]

    async def update_task(self, task_id: str, updates: dict) -> Optional[dict]:
        task = self._memory_store["tasks"].get(task_id)
        if not task:
            return None
        task.update(updates)
        task["updated_at"] = utcnow_str()
        if self._live_client:
            try:
                pid = task["project_id"]
                await self._live_client.collection("projects").document(pid).collection("tasks").document(task_id).update(updates)
            except Exception:
                pass
        self._save_fallback()
        return task

    # Approvals
    async def create_approval(self, project_id: str, action: str, rationale: str, risk_level: str, rollback_plan: str, action_payload: dict, approval_token: str, expires_at: str) -> dict:
        approval_id = str(uuid.uuid4())
        doc = {
            "id": approval_id,
            "project_id": project_id,
            "action": action,
            "rationale": rationale,
            "risk_level": risk_level,
            "rollback_plan": rollback_plan,
            "action_payload": action_payload,
            "approval_token": approval_token,
            "token_expires_at": expires_at,
            "status": "pending",
            "decided_at": None,
            "decision_channel": None,
            "created_at": utcnow_str()
        }
        if self._live_client:
            try:
                await self._live_client.collection("approvals").document(approval_id).set(doc)
            except Exception:
                pass
        self._memory_store["approvals"][approval_id] = doc
        self._save_fallback()
        await self.add_execution_log(
            project_id=project_id,
            agent_id="security_reviewer",
            level="warn",
            event_type="approval_requested",
            message=f"Human authorization required for '{action}'. Risk: {risk_level.upper()}."
        )
        return doc

    async def list_approvals(self, project_id: Optional[str] = None) -> list[dict]:
        if self._live_client:
            try:
                query = self._live_client.collection("approvals")
                if project_id:
                    query = query.where("project_id", "==", project_id)
                docs = query.order_by("created_at", direction="DESCENDING").stream()
                results = [d.to_dict() async for d in docs]
                if results:
                    return results
            except Exception:
                pass
        approvals = list(self._memory_store["approvals"].values())
        if project_id:
            approvals = [a for a in approvals if a.get("project_id") == project_id]
        return sorted(approvals, key=lambda x: x.get("created_at", ""), reverse=True)

    async def update_approval(self, approval_id: str, status: str, channel: str = "desktop_ui") -> Optional[dict]:
        approval = self._memory_store["approvals"].get(approval_id)
        if not approval:
            return None
        approval["status"] = status
        approval["decided_at"] = utcnow_str()
        approval["decision_channel"] = channel
        if self._live_client:
            try:
                await self._live_client.collection("approvals").document(approval_id).update({
                    "status": status,
                    "decided_at": approval["decided_at"],
                    "decision_channel": channel
                })
            except Exception:
                pass
        self._save_fallback()
        return approval

    # Agents
    async def list_agents(self) -> list[dict]:
        return list(self._memory_store["agents"].values())

    async def update_agent(self, agent_id: str, updates: dict) -> Optional[dict]:
        agent = self._memory_store["agents"].get(agent_id)
        if not agent:
            return None
        agent.update(updates)
        self._save_fallback()
        return agent

    # Execution Logs
    async def add_execution_log(self, project_id: str, agent_id: str, level: str, event_type: str, message: str, metadata: dict = None) -> dict:
        log_id = str(uuid.uuid4())
        doc = {
            "id": log_id,
            "project_id": project_id,
            "agent_id": agent_id,
            "level": level,
            "event_type": event_type,
            "message": message,
            "metadata": metadata or {},
            "created_at": utcnow_str()
        }
        if self._live_client:
            try:
                await self._live_client.collection("execution_logs").document(log_id).set(doc)
            except Exception:
                pass
        self._memory_store["execution_logs"].insert(0, doc)
        if len(self._memory_store["execution_logs"]) > 200:
            self._memory_store["execution_logs"] = self._memory_store["execution_logs"][:200]
        self._save_fallback()
        return doc

    async def list_execution_logs(self, project_id: Optional[str] = None, limit: int = 50) -> list[dict]:
        logs = self._memory_store["execution_logs"]
        if project_id:
            logs = [l for l in logs if l.get("project_id") == project_id]
        return logs[:limit]

# Global instance
db = FirestoreDB()
