import os
import secrets
from fastapi import HTTPException, Request

SESSION_SECRET: str = os.environ.get("PHOENIX_SESSION_SECRET") or secrets.token_urlsafe(32)

_ALLOWED_HOSTS = {"127.0.0.1", "localhost", "testserver"}


def _is_loopback_host(host_header: str) -> bool:
    if not host_header:
        return False
    host = host_header.strip().lower()
    if host.startswith("["):
        # IPv6 loopback [::1]:port
        addr = host.split("]")[0].lstrip("[")
        return addr == "::1"
    hostname = host.split(":")[0]
    return hostname in _ALLOWED_HOSTS


def _is_loopback_origin(origin_header: str) -> bool:
    if not origin_header:
        return True
    o = origin_header.strip().lower()
    return (
        o.startswith("http://127.0.0.1")
        or o.startswith("http://localhost")
        or o.startswith("http://[::1]")
        or o == "null"
    )


def reject_path_fields(request: Request, body: dict | None = None):
    forbidden = {"path", "local_path", "folder", "dir", "directory", "filepath"}
    for k in request.query_params.keys():
        if k.lower() in forbidden:
            raise HTTPException(status_code=400, detail="Filesystem path parameters are not permitted")
    if isinstance(body, dict):
        for k in body.keys():
            if str(k).lower() in forbidden:
                raise HTTPException(status_code=400, detail="Filesystem path fields are not permitted")


async def verify_live_request(request: Request):
    host = request.headers.get("host", "")
    if not _is_loopback_host(host):
        raise HTTPException(status_code=403, detail="Non-loopback Host rejected")

    origin = request.headers.get("origin", "")
    if origin and not _is_loopback_origin(origin):
        raise HTTPException(status_code=403, detail="Non-loopback Origin rejected")

    reject_path_fields(request)

    token = request.headers.get("x-phoenix-session") or request.query_params.get("session") or ""
    if not token or not secrets.compare_digest(token, SESSION_SECRET):
        raise HTTPException(status_code=401, detail="Missing or invalid session secret")
