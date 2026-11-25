import asyncio
import logging
import os
import random
import sys
from typing import Any, Dict, List, Optional, Tuple

import httpx
import keyring

KEYRING_SERVICE = "PHOENIX_GITHUB"
KEYRING_USERNAME = "oauth_token"

GRAPHQL_REPOS_QUERY = """
query {
  viewer {
    login
    repositories(
      first: 30,
      orderBy: {field: PUSHED_AT, direction: DESC},
      ownerAffiliations: [OWNER, COLLABORATOR]
    ) {
      nodes {
        nameWithOwner
        isPrivate
        pushedAt
        url
        defaultBranchRef {
          name
          target {
            ... on Commit {
              oid
              messageHeadline
              committedDate
              statusCheckRollup { state }
            }
          }
        }
        pullRequests(states: OPEN, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
          totalCount
          nodes {
            number
            title
            url
            isDraft
            updatedAt
            reviewDecision
            author { login }
            commits(last: 1) {
              nodes {
                commit {
                  statusCheckRollup { state }
                }
              }
            }
          }
        }
        issues(states: OPEN) { totalCount }
      }
    }
  }
}
"""


def log_gh(msg: str):
    try:
        logging.info(f"[gh] {msg}")
        if getattr(sys, "frozen", False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        diag_file = os.path.join(app_dir, "phoenix_runtime.txt")
        with open(diag_file, "a", encoding="utf-8") as f:
            f.write(f"[gh] {msg}\n")
    except Exception:
        pass


def get_stored_token() -> Optional[str]:
    try:
        tok = keyring.get_password(KEYRING_SERVICE, KEYRING_USERNAME)
        return tok.strip() if tok else None
    except Exception as e:
        log_gh(f"keyring read failed: {e!r}")
        return None


def store_token(token: str):
    keyring.set_password(KEYRING_SERVICE, KEYRING_USERNAME, token.strip())
    log_gh("Token stored in Windows Credential Manager via keyring (value redacted)")


def delete_token():
    try:
        keyring.delete_password(KEYRING_SERVICE, KEYRING_USERNAME)
        log_gh("Token deleted from Windows Credential Manager")
    except keyring.errors.PasswordDeleteError:
        pass
    except Exception as e:
        log_gh(f"keyring delete error: {e!r}")


class BackoffError(Exception):
    def __init__(self, retry_after: int, message: str = "Rate limit backoff"):
        super().__init__(message)
        self.retry_after = retry_after


class GH:
    def __init__(self, token: str):
        self.c = httpx.AsyncClient(
            base_url="https://api.github.com",
            timeout=20.0,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "phoenix-desktop",
            },
        )
        self.etags: Dict[Tuple[str, Tuple[Tuple[str, Any], ...]], Tuple[str, Any]] = {}
        self.remaining: Optional[str] = None
        self.reset: Optional[str] = None

    async def close(self):
        await self.c.aclose()

    def _rl(self, r: httpx.Response):
        if "x-ratelimit-remaining" in r.headers:
            self.remaining = r.headers.get("x-ratelimit-remaining")
        if "x-ratelimit-reset" in r.headers:
            self.reset = r.headers.get("x-ratelimit-reset")

    async def graphql(self, q: str) -> Dict[str, Any]:
        for attempt in range(3):
            r = await self.c.post("/graphql", json={"query": q})
            self._rl(r)
            if r.status_code in (403, 429):
                retry_after = int(r.headers.get("retry-after", 60))
                if attempt < 2 and retry_after <= 5:
                    await asyncio.sleep(retry_after + random.uniform(0.1, 0.5))
                    continue
                raise BackoffError(retry_after, f"GitHub rate limit ({r.status_code}); retry after {retry_after}s")
            r.raise_for_status()
            j = r.json()
            if "errors" in j and not j.get("data"):
                raise RuntimeError(j["errors"][0]["message"])
            return j["data"]
        raise BackoffError(60, "GitHub GraphQL retries exhausted")

    async def rest(self, path: str, **params: Any) -> Tuple[Any, int]:
        """Conditional GET using ETag. Returns (json_data, status_code)."""
        k = (path, tuple(sorted(params.items())))
        headers = {"If-None-Match": self.etags[k][0]} if k in self.etags else {}
        r = await self.c.get(path, params=params, headers=headers)
        self._rl(r)
        if r.status_code == 304 and k in self.etags:
            log_gh(f"REST {path} -> 304 Not Modified (ETag cache hit, remaining={self.remaining})")
            return self.etags[k][1], 304
        if r.status_code in (403, 429):
            retry_after = int(r.headers.get("retry-after", 60))
            raise BackoffError(retry_after, f"GitHub REST rate limit ({r.status_code})")
        r.raise_for_status()
        data = r.json()
        if e := r.headers.get("etag"):
            self.etags[k] = (e, data)
        return data, r.status_code

    async def validate_token(self) -> Dict[str, Any]:
        """Validate token via /user (with ETag) and capture OAuth scopes / SSO notices."""
        r = await self.c.get("/user")
        self._rl(r)
        r.raise_for_status()
        user = r.json()
        scopes = r.headers.get("x-oauth-scopes", "")
        sso_header = r.headers.get("x-github-sso", "")
        return {
            "login": user.get("login"),
            "scopes": [s.strip() for s in scopes.split(",") if s.strip()] if scopes else ["fine-grained-pat"],
            "sso_notice": sso_header or None,
            "rate_remaining": self.remaining,
            "rate_reset": self.reset,
        }

    async def sweep_repos(self) -> Dict[str, Any]:
        data = await self.graphql(GRAPHQL_REPOS_QUERY)
        viewer = data.get("viewer") or {}
        login = viewer.get("login")
        nodes = (viewer.get("repositories") or {}).get("nodes") or []
        repos: List[Dict[str, Any]] = []
        for n in nodes:
            if not n:
                continue
            dbr = n.get("defaultBranchRef") or {}
            tgt = dbr.get("target") or {}
            rollup = tgt.get("statusCheckRollup") or {}
            prs_obj = n.get("pullRequests") or {}
            open_prs = []
            for pr in prs_obj.get("nodes") or []:
                if not pr:
                    continue
                pr_commits = (pr.get("commits") or {}).get("nodes") or []
                pr_ci = None
                if pr_commits:
                    pr_ci = ((pr_commits[0].get("commit") or {}).get("statusCheckRollup") or {}).get("state")
                open_prs.append(
                    {
                        "number": pr.get("number"),
                        "title": pr.get("title"),
                        "url": pr.get("url"),
                        "isDraft": bool(pr.get("isDraft")),
                        "updatedAt": pr.get("updatedAt"),
                        "reviewDecision": pr.get("reviewDecision"),
                        "author": (pr.get("author") or {}).get("login"),
                        "ciState": pr_ci,
                    }
                )
            repos.append(
                {
                    "nameWithOwner": n.get("nameWithOwner"),
                    "isPrivate": bool(n.get("isPrivate")),
                    "pushedAt": n.get("pushedAt"),
                    "url": n.get("url"),
                    "defaultBranch": dbr.get("name"),
                    "headOid": tgt.get("oid"),
                    "headMessage": tgt.get("messageHeadline"),
                    "headCommittedAt": tgt.get("committedDate"),
                    "ciState": rollup.get("state"),
                    "openPrsCount": int(prs_obj.get("totalCount") or 0),
                    "openPrs": open_prs,
                    "openIssuesCount": int((n.get("issues") or {}).get("totalCount") or 0),
                }
            )
        log_gh(f"sweep login={login} repos={len(repos)} remaining={self.remaining}")
        return {
            "login": login,
            "repos": repos,
            "rate_remaining": self.remaining,
            "rate_reset": self.reset,
        }


async def start_device_flow(client_id: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.post(
            "https://github.com/login/device/code",
            headers={"Accept": "application/json"},
            data={"client_id": client_id, "scope": "repo read:org"},
        )
        r.raise_for_status()
        return r.json()


async def poll_device_flow(client_id: str, device_code: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
        r.raise_for_status()
        return r.json()
