import os
from fastapi import FastAPI
app = FastAPI(title="PHOENIX Local Node", version="0.1.0",
              description="Health-only local execution bridge. No shell/filesystem tools exposed.")

@app.get("/health")
def health():
    return {"status": "ok", "service": "phoenix-local-node",
            "node_name": os.getenv("PHOENIX_NODE_NAME", "local-node"),
            "execution_enabled": False}

@app.get("/capabilities")
def capabilities():
    return {"capabilities": ["health_check"],
            "disabled": ["arbitrary_shell_execution", "unrestricted_filesystem_access",
                         "deployment", "credential_access"],
            "message": "Execution tools require authentication, sandboxing and policy enforcement."}
