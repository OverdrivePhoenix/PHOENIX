from agents import Agent, Runner, function_tool, set_default_openai_api, set_default_openai_client
from openai import AsyncOpenAI
from ..firestore_db import db
from ..config import settings
from .jarvis import JarvisVoiceButler

def configure_gemini() -> None:
    """Configure the Agents SDK to use Google's OpenAI-compatible Chat Completions endpoint."""
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    client = AsyncOpenAI(api_key=settings.gemini_api_key, base_url=settings.gemini_base_url)
    set_default_openai_client(client)
    set_default_openai_api("chat_completions")

def build_planner(project_id: str, project_name: str) -> Agent:
    @function_tool
    async def create_project_task(title: str, description: str, priority: str, assigned_agent: str) -> str:
        """Create one structured task in this project stored in Firestore.
        Priority: low, medium, high, critical.
        Agent: project_manager, software_engineer, qa_engineer, security_reviewer, devops_engineer, documentation_agent.
        """
        priorities = {"low", "medium", "high", "critical"}
        valid_agents = {
            "project_manager", "software_engineer", "qa_engineer",
            "security_reviewer", "devops_engineer", "documentation_agent"
        }
        p = priority.lower().strip()
        a = assigned_agent.lower().strip()
        if p not in priorities:
            p = "medium"
        if a not in valid_agents:
            a = "software_engineer"
        if not title.strip():
            return "Rejected: empty task title."

        task = await db.create_task(
            project_id=project_id,
            title=title.strip()[:240],
            description=description.strip(),
            priority=p,
            assigned_agent=a
        )
        await db.add_execution_log(
            project_id=project_id,
            agent_id="project_manager",
            level="info",
            event_type="task_created",
            message=f"Created task '{task['title']}' assigned to {a}."
        )
        return f"Created task {task['id']}: {task['title']}"

    return Agent(
        name="PHOENIX PM & Architecture Agent",
        model=settings.gemini_model,
        instructions=(
            f"{JarvisVoiceButler.get_system_instructions()}\n\n"
            f"You are decomposing goals for project '{project_name}'. "
            "Break the user's objective into 5-8 actionable, sequenced engineering tasks. "
            "Include discovery, architecture, core implementation, QA test suite, security diff audit, "
            "and documentation. Use `create_project_task` for each item. "
            "Conclude with a calm, dignified British summary addressed to 'Sir'."
        ),
        tools=[create_project_task],
    )

async def generate_plan(project_id: str, project_name: str, goal: str) -> str:
    configure_gemini()
    agent = build_planner(project_id, project_name)
    prompt = (
        f"Project: {project_name}\n"
        f"Goal: {goal}\n"
        "Generate the structured engineering task graph."
    )
    result = await Runner.run(agent, prompt)
    return result.final_output or f"Plan established for {project_name}, Sir. All tasks have been logged to Firestore."
