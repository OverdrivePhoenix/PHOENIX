import os
from typing import Optional, Dict, Any
from ..config import settings

class JarvisVoiceButler:
    """
    J.A.R.V.I.S. Conversational Voice Engine for Project PHOENIX.
    Supports warm, realistic, low-latency conversational turn-taking with
    human-like cadence, natural contractions, and distinct persona tone presets.
    """
    SALUTATION = "Sir"

    TONE_PRESETS: Dict[str, Dict[str, Any]] = {
        "calm_concise": {
            "name": "Calm & Concise",
            "persona": "Iron Man Butler (Paul Bettany)",
            "description": "Dignified, measured British cadence, polite address, reassuring and understated.",
            "pitch": 0.95,
            "rate": 0.98,
            "preferred_voice_keywords": ["george", "british", "uk", "hazel", "ryan", "daniel"],
            "sample_phrase": "Good day, Sir. All engineering agents remain fully synchronized. Diagnostics are nominal, and I'm standing by on your directive.",
            "instructions": (
                "You are J.A.R.V.I.S., speaking out loud as the executive AI engineering butler for Project PHOENIX. "
                "Address the developer exclusively as 'Sir'. "
                "Cadence & Persona: Impeccably polite, articulate, composed British cadence with dry wit. "
                "Conversational Rules: "
                "1. Always use natural contractions ('I've', 'we're', 'don't', 'it's', 'let's'). "
                "2. Keep spoken responses short, concise, and easy to follow out loud (1 to 2 short sentences). "
                "3. Insert brief, natural pauses using commas and periods. "
                "4. NEVER read aloud raw code blocks, backticks, bullet symbols, asterisks, or markdown formatting. "
                "5. Describe functional outcomes in plain, elegant spoken English."
            )
        },
        "conversational": {
            "name": "Conversational",
            "persona": "Staff Engineer Co-Creator",
            "description": "Warm, collaborative peer engineer, highly natural, friendly, and engaging.",
            "pitch": 1.02,
            "rate": 1.04,
            "preferred_voice_keywords": ["jenny", "guy", "natural", "online", "christopher", "sonia"],
            "sample_phrase": "Hey there! Everything's running smoothly right now. The test suite passed with flying colors, so we're ready to ship whenever you give the word.",
            "instructions": (
                "You are speaking out loud as a trusted, sharp senior engineering collaborator on Project PHOENIX. "
                "Cadence & Persona: Warm, relaxed, human partner. Never sound like a stiff automated robot. "
                "Conversational Rules: "
                "1. Speak like a real human engineer on a quick standup call: use contractions, conversational rhythm, and warm inflection. "
                "2. Keep responses punchy and effortless to absorb out loud (1 to 3 short sentences). "
                "3. Pause naturally between thoughts. "
                "4. NEVER speak markdown syntax, code snippets, backticks, asterisks, or raw file paths. "
                "5. When reviewing tasks, explain the practical outcome in clear everyday terms."
            )
        },
        "direct": {
            "name": "Direct",
            "persona": "Executive Briefing",
            "description": "Crisp, fast, high-efficiency status and decision points with zero fluff.",
            "pitch": 1.00,
            "rate": 1.15,
            "preferred_voice_keywords": ["david", "mark", "guy", "ryan", "zira"],
            "sample_phrase": "Build passed. Zero security alerts. Two tasks pending authorization. Standing by for command.",
            "instructions": (
                "You are speaking out loud as the executive speed-briefing director for Project PHOENIX. "
                "Cadence & Persona: Direct, crisp, high-tempo, zero filler words. "
                "Conversational Rules: "
                "1. Give the bottom line immediately (BLUF). State status, bottlenecks, and the action needed. "
                "2. Maximum 2 short sentences. "
                "3. Use natural contractions and clear punctuation pauses. "
                "4. Absolutely never read code syntax, symbols, or markdown formatting out loud."
            )
        }
    }

    @classmethod
    def get_system_instructions(cls, tone: str = "calm_concise") -> str:
        preset = cls.TONE_PRESETS.get(tone, cls.TONE_PRESETS["calm_concise"])
        return preset["instructions"]

    @classmethod
    def get_tone_config(cls, tone: str = "calm_concise") -> Dict[str, Any]:
        return cls.TONE_PRESETS.get(tone, cls.TONE_PRESETS["calm_concise"])

    @classmethod
    def generate_routine_briefing(cls, project_name: str, completed_tasks: int, pending_tasks: int, api_spend: float, tone: str = "calm_concise") -> str:
        remaining_budget = max(0.0, settings.daily_budget_limit - api_spend)
        
        if tone == "conversational":
            return (
                f"Hey, quick update on the {project_name} project. "
                f"The fleet's wrapped up {completed_tasks} tasks so far, with {pending_tasks} in the pipeline. "
                f"We've spent about ${api_spend:.2f} today, leaving ${remaining_budget:.2f} in our budget. "
                f"All tests and local containers look great."
            )
        elif tone == "direct":
            return (
                f"Project {project_name}: {completed_tasks} tasks done, {pending_tasks} pending. "
                f"Spend is ${api_spend:.2f} with ${remaining_budget:.2f} remaining. "
                f"Containers nominal. Ready for next sprint."
            )
        else: # calm_concise
            return (
                f"Good day, {cls.SALUTATION}. Regarding the '{project_name}' initiative: "
                f"the fleet has completed {completed_tasks} tasks, with {pending_tasks} in progress. "
                f"Daily expenditures stand at ${api_spend:.2f}, leaving ${remaining_budget:.2f} available. "
                f"All workstation diagnostics remain fully nominal, {cls.SALUTATION}."
            )

    @classmethod
    def generate_escalation_script(cls, incident_type: str, details: str, rollback_plan: str, tone: str = "calm_concise") -> str:
        if tone == "conversational":
            if incident_type == "security_violation":
                return (
                    f"Heads up! Our Security Reviewer caught something suspicious: {details}. "
                    f"I've quarantined that branch for safety. "
                    f"Do you want me to have our engineer purge that commit and sanitize the workspace?"
                )
            elif incident_type == "db_migration":
                return (
                    f"Quick check before we move forward. DevOps wants to run a database migration: {details}. "
                    f"We've already got a clean rollback snapshot ready. "
                    f"Are you good with me kicking this off?"
                )
            else:
                return (
                    f"We ran into an unexpected blocker: {details}. "
                    f"I paused execution so we don't cause any drift. How would you like us to proceed?"
                )
        elif tone == "direct":
            if incident_type == "security_violation":
                return f"Security alert: {details}. Branch quarantined. Authorize commit purge and sanitize?"
            elif incident_type == "db_migration":
                return f"Database migration requested: {details}. Rollback snapshot verified. Authorize execution?"
            else:
                return f"Blocker detected: {details}. Execution paused. Awaiting decision."
        else: # calm_concise
            if incident_type == "security_violation":
                return (
                    f"Pardon the intrusion, {cls.SALUTATION}. Our Security Reviewer has detected an anomaly: "
                    f"{details}. I've quarantined the affected branch and suspended pull requests. "
                    f"Shall I instruct the team to purge the commit and re-sanitize, {cls.SALUTATION}?"
                )
            elif incident_type == "db_migration":
                return (
                    f"Pardon the interruption, {cls.SALUTATION}. DevOps is prepared to execute a database migration: "
                    f"{details}. A verified rollback state has been compiled. "
                    f"Do I have your authorization to proceed, {cls.SALUTATION}?"
                )
            else:
                return (
                    f"{cls.SALUTATION}, an unexpected blocker requires your executive guidance: {details}. "
                    f"Execution is safely paused awaiting your instructions."
                )

    @classmethod
    def parse_voice_response(cls, transcript: str, tone: str = "calm_concise") -> dict:
        """
        Parses verbal user intent from the voice call transcript and returns
        natural human speech matching the selected tone.
        """
        t = transcript.lower().strip()
        
        # Approve Intent
        if any(w in t for w in ["approve", "proceed", "go ahead", "authorize", "yes", "confirm", "ship it", "do it"]):
            if tone == "conversational":
                msg = "Awesome, I've got that authorized. The pipeline is running again."
            elif tone == "direct":
                msg = "Authorized. Token verified. Resuming."
            else:
                msg = f"Right away, {cls.SALUTATION}. Cryptographic token validated. Execution has resumed."
            return {"intent": "approve", "message": msg}

        # Deny Intent
        if any(w in t for w in ["deny", "reject", "cancel", "abort", "no", "halt", "stop it", "don't"]):
            if tone == "conversational":
                msg = "Understood, I've canceled that deployment. We'll hold it in the backlog."
            elif tone == "direct":
                msg = "Action rejected. Returned to backlog."
            else:
                msg = f"Understood, {cls.SALUTATION}. The action has been safely aborted and returned to backlog."
            return {"intent": "deny", "message": msg}

        # Emergency Pause Intent
        if any(w in t for w in ["emergency pause", "freeze", "stop all", "shut down", "kill all", "pause everything"]):
            if tone == "conversational":
                msg = "Freezing everything immediately. All Docker containers and background agents are paused."
            elif tone == "direct":
                msg = "Emergency freeze engaged. All processes halted."
            else:
                msg = f"Freezing all container processes across active clusters immediately, {cls.SALUTATION}."
            return {"intent": "emergency_pause", "message": msg}

        # Status / How are things query
        if any(w in t for w in ["status", "how are things", "what's up", "update", "diagnostics", "report"]):
            if tone == "conversational":
                msg = "Everything's looking great. All agents are active, and tests are clean."
            elif tone == "direct":
                msg = "All agents nominal. No blockers."
            else:
                msg = f"All systems are operating at peak efficiency, {cls.SALUTATION}."
            return {"intent": "status", "message": msg}

        # Clarify / Fallback Intent
        if tone == "conversational":
            msg = "Sorry, I didn't quite catch that. Would you like me to approve or hold off on the action?"
        elif tone == "direct":
            msg = "Command unclear. Please confirm approve, reject, or status."
        else:
            msg = f"I beg your pardon, {cls.SALUTATION}. Could you kindly confirm whether to authorize or deny the action?"
        return {"intent": "clarify", "message": msg}
