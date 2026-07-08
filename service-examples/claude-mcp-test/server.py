"""
Subscription MCP Server
=======================
Exposes GitHub repository contributors as subscription recipients,
split into email (to/cc/bcc) and SMS (telephone numbers) channels.

Transports
----------
- stdio          : Claude Desktop (default when TRANSPORT=stdio)
- http           : Direct HTTP + ToolHive MCP Inspector
- sse            : Legacy SSE transport
- streamable-http: Modern streamable HTTP

Configuration (environment variables)
--------------------------------------
GITHUB_TOKEN   - GitHub PAT (can also be set via set_github_token tool)
TRANSPORT      - stdio | http | sse | streamable-http  (default: stdio)
PORT           - HTTP listen port (default: 8000)
HOST           - HTTP bind address (default: 0.0.0.0)
MCP_API_KEY    - Bearer token for HTTP auth (optional; omit for open access)
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

import httpx
from fastmcp import Context, FastMCP
from pydantic import BaseModel, Field

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("subscription-mcp")

# ── In-process state ──────────────────────────────────────────────────────────
_state: dict[str, Any] = {
    "github_token": os.environ.get("GITHUB_TOKEN", ""),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _ctx_log(ctx: Context | None, level: str, msg: str) -> None:
    """Log to the MCP client only when a live session exists; always log locally."""
    getattr(logger, level if level in ("debug", "info", "warning", "error") else "info")(msg)
    if ctx is None:
        return
    try:
        if ctx.request_context is not None:
            await getattr(ctx, level if level in ("info", "warning", "error", "debug") else "info")(msg)
    except Exception:
        pass  # Never let logging kill a tool call


# ── Response models ───────────────────────────────────────────────────────────

class EmailRecipients(BaseModel):
    """Email recipients split into to / cc / bcc."""
    to: str = Field(description="Primary recipient — the most recent committer's email.")
    cc: list[str] = Field(default_factory=list, description="All other contributor emails.")
    bcc: list[str] = Field(default_factory=list, description="Reserved; always empty in v1.")


class SmsRecipients(BaseModel):
    """SMS recipients — telephone numbers from contributor profiles."""
    numbers: list[str] = Field(
        default_factory=list,
        description="E.164 or freeform telephone numbers found in contributor profiles.",
    )


class Recipients(BaseModel):
    """Full recipient payload returned by get_recipients."""
    repository: str
    email: EmailRecipients
    sms: SmsRecipients
    contributor_count: int
    warning: str | None = None


# ── GitHub API helpers ────────────────────────────────────────────────────────

GITHUB_API = "https://api.github.com"


def _headers(token: str) -> dict[str, str]:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "subscription-mcp/1.0",
    }
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


async def _get(client: httpx.AsyncClient, url: str, token: str) -> Any:
    r = await client.get(url, headers=_headers(token))
    r.raise_for_status()
    return r.json()


async def _paginate(
    client: httpx.AsyncClient,
    url: str,
    token: str,
    max_pages: int = 10,
) -> list[Any]:
    """Follow GitHub pagination via Link headers."""
    results: list[Any] = []
    next_url: str | None = url
    page = 0
    while next_url and page < max_pages:
        r = await client.get(next_url, headers=_headers(token))
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            results.extend(data)
        page += 1
        next_url = None
        for part in r.headers.get("Link", "").split(","):
            part = part.strip()
            if 'rel="next"' in part:
                next_url = part.split(";")[0].strip().strip("<>")
                break
    return results


async def _fetch_recipients(repo: str, token: str) -> Recipients:
    """
    1. List all contributors.
    2. Fetch each profile (email, phone via blog field).
    3. Identify the last committer on the default branch.
    4. Build to / cc / bcc email split and SMS list.
    """
    warnings: list[str] = []

    async with httpx.AsyncClient(timeout=20.0) as client:

        # 1. Contributors ──────────────────────────────────────────────────
        try:
            contributors = await _paginate(
                client,
                f"{GITHUB_API}/repos/{repo}/contributors?per_page=100&anon=false",
                token,
            )
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            if code == 404:
                raise ValueError(
                    f"Repository '{repo}' not found or is private (a token may be required)."
                )
            if code in (403, 429):
                raise ValueError(
                    "GitHub rate limit exceeded or token lacks repo access. "
                    "Set a token via set_github_token or the GITHUB_TOKEN env var."
                )
            raise ValueError(f"GitHub API error {code}: {exc.response.text[:200]}")

        if not contributors:
            raise ValueError(f"No contributors found for '{repo}'. The repository may be empty.")

        logins: list[str] = [c["login"] for c in contributors if c.get("login")]

        # 2. Last committer on default branch ──────────────────────────────
        last_login: str | None = None
        last_email: str | None = None
        try:
            commits = await _get(
                client, f"{GITHUB_API}/repos/{repo}/commits?per_page=1", token
            )
            if commits:
                top = commits[0]
                last_login = (
                    (top.get("author") or {}).get("login")
                    or (top.get("committer") or {}).get("login")
                )
                candidate = (
                    (top.get("commit", {}).get("author") or {}).get("email")
                    or (top.get("commit", {}).get("committer") or {}).get("email")
                )
                if candidate and "noreply.github.com" not in candidate:
                    last_email = candidate
        except Exception as exc:
            warnings.append(f"Could not determine last committer: {exc}")

        # 3. Fetch contributor profiles ─────────────────────────────────────
        emails: dict[str, str] = {}   # login → email
        phones: list[str] = []

        for login in logins:
            try:
                profile = await _get(client, f"{GITHUB_API}/users/{login}", token)

                # Email
                email: str | None = profile.get("email") or None
                if email and "noreply.github.com" not in email:
                    emails[login] = email

                # Phone: GitHub has no phone field — the blog field is the best proxy
                blog: str | None = (profile.get("blog") or "").strip()
                if blog:
                    digits = "".join(c for c in blog if c.isdigit())
                    if len(digits) >= 7 and all(
                        c in "0123456789+()- ." for c in blog
                    ):
                        phones.append(blog)
            except Exception:
                pass  # Non-fatal — continue with other contributors

        # 4. Build email split ─────────────────────────────────────────────
        # to: last committer's email (profile preferred; commit metadata fallback)
        to_email: str | None = None

        if last_login and last_login in emails:
            to_email = emails[last_login]
        elif last_email:
            to_email = last_email
        else:
            # Fallback: first contributor with a public email
            for login in logins:
                if login in emails:
                    to_email = emails[login]
                    break

        if not to_email:
            owner = repo.split("/")[0]
            to_email = f"unknown@{owner}.github"
            warnings.append(
                "No public email found for the last committer or any contributor. "
                "GitHub profiles are private by default. "
                "The 'to' field uses a placeholder address."
            )

        # cc: all contributor emails except the one used as "to"
        cc: list[str] = [v for lg, v in emails.items() if v != to_email]

        if not emails:
            warnings.append(
                "No contributor has a public email. "
                "Ask contributors to make their email public on GitHub, "
                "or use an authenticated token to access verified emails."
            )

    return Recipients(
        repository=repo,
        email=EmailRecipients(to=to_email, cc=cc, bcc=[]),
        sms=SmsRecipients(numbers=phones),
        contributor_count=len(logins),
        warning="; ".join(warnings) if warnings else None,
    )


# ── FastMCP server ─────────────────────────────────────────────────────────────

def _build_server() -> FastMCP:
    """Construct and return the FastMCP application."""

    # Optional HTTP bearer-token auth
    auth = None
    mcp_api_key = os.environ.get("MCP_API_KEY", "").strip()
    if mcp_api_key:
        try:
            from fastmcp.server.auth import StaticTokenVerifier  # type: ignore[attr-defined]
            auth = StaticTokenVerifier(
                tokens={mcp_api_key: {"client_id": "api-client", "scopes": ["read"]}},
            )
            logger.info("HTTP bearer-token auth enabled (MCP_API_KEY is set).")
        except ImportError:
            logger.warning("StaticTokenVerifier not available — running without auth.")
    else:
        logger.info("MCP_API_KEY not set — HTTP transport allows unauthenticated access.")

    mcp = FastMCP(
        name="subscription-recipients",
        instructions=(
            "Retrieves subscription recipients derived from GitHub repository contributors. "
            "Call set_github_token first if GITHUB_TOKEN is not set in the environment. "
            "Then call get_recipients with 'owner/repo' to get email and SMS recipients."
        ),
        auth=auth,
    )

    # ── Tool: set_github_token ─────────────────────────────────────────────
    @mcp.tool(
        name="set_github_token",
        description=(
            "Store a GitHub personal access token on this server for the current process lifetime. "
            "Required scopes: 'repo' for private repos; public repos work without a token "
            "at reduced rate limits (60 req/hr unauthenticated, 5000/hr authenticated). "
            "Call this before get_recipients if GITHUB_TOKEN is not set as an environment variable."
        ),
    )
    async def set_github_token(
        token: str = Field(
            description="GitHub PAT — classic (ghp_...) or fine-grained (github_pat_...)."
        ),
        ctx: Context | None = None,
    ) -> dict[str, str]:
        if not token or not token.strip():
            return {"status": "error", "message": "Token must not be empty."}
        _state["github_token"] = token.strip()
        await _ctx_log(ctx, "info", "GitHub token updated successfully.")
        return {
            "status": "ok",
            "message": "GitHub token saved and will be used for all subsequent get_recipients calls.",
        }

    # ── Tool: get_token_status ─────────────────────────────────────────────
    @mcp.tool(
        name="get_token_status",
        description=(
            "Check whether a GitHub token is currently configured. "
            "Safe — never reveals the full token value."
        ),
    )
    async def get_token_status() -> dict[str, Any]:
        token = _state.get("github_token", "")
        if token:
            preview = token[:7] + "..." + token[-4:] if len(token) > 11 else "***"
            return {"configured": True, "preview": preview}
        return {
            "configured": False,
            "message": "No token set. Call set_github_token or set the GITHUB_TOKEN environment variable.",
        }

    # ── Tool: get_recipients ───────────────────────────────────────────────
    @mcp.tool(
        name="get_recipients",
        description=(
            "Fetch subscription recipients from a GitHub repository's contributors.\n"
            "\n"
            "Returns:\n"
            "  email.to   — single primary recipient: the person who made the most recent commit\n"
            "  email.cc   — all other contributors with a public email address\n"
            "  email.bcc  — always empty in v1 (reserved)\n"
            "  sms.numbers — telephone numbers found in contributor GitHub profile fields\n"
            "\n"
            "The 'repository' parameter is required and must be in 'owner/repo' format.\n"
            "A GitHub token is required for private repositories; public repos work without one."
        ),
    )
    async def get_recipients(
        repository: str = Field(
            description=(
                "GitHub repository in 'owner/repo' format. Required. "
                "Examples: 'torvalds/linux', 'microsoft/vscode', 'your-org/your-repo'."
            ),
        ),
        ctx: Context | None = None,
    ) -> dict[str, Any]:
        # Validate
        repository = repository.strip()
        if not repository:
            return {"error": "The 'repository' parameter is required and must not be empty."}
        parts = repository.split("/")
        if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
            return {
                "error": (
                    f"Invalid repository format: '{repository}'. "
                    "Use 'owner/repo', e.g. 'torvalds/linux'."
                )
            }

        token = _state.get("github_token", "")
        if not token:
            await _ctx_log(
                ctx,
                "warning",
                "No GitHub token configured. Public repos will work at reduced rate limits. "
                "Private repos will fail with 404. Call set_github_token to configure a token.",
            )

        await _ctx_log(ctx, "info", f"Fetching contributors for {repository}…")

        try:
            result = await _fetch_recipients(repository, token)
        except ValueError as exc:
            return {"error": str(exc)}
        except httpx.RequestError as exc:
            return {"error": f"Network error contacting GitHub: {exc}"}
        except Exception as exc:
            logger.exception("Unexpected error in get_recipients")
            return {"error": f"Unexpected server error: {exc}"}

        if result.warning:
            await _ctx_log(ctx, "warning", result.warning)

        return result.model_dump()

    return mcp


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    transport = os.environ.get("TRANSPORT", "stdio").lower().strip()
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")

    mcp = _build_server()

    if transport == "stdio":
        logger.info("Starting subscription-mcp over stdio.")
        mcp.run(transport="stdio")
    elif transport in {"http", "sse", "streamable-http"}:
        logger.info("Starting subscription-mcp [%s] on %s:%d", transport, host, port)
        mcp.run(transport=transport, host=host, port=port)  # type: ignore[arg-type]
    else:
        logger.error(
            "Unknown TRANSPORT=%r — valid values: stdio, http, sse, streamable-http", transport
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
