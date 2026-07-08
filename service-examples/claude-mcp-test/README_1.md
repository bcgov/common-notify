# Subscription MCP Server

A [FastMCP](https://github.com/jlowin/fastmcp) server that exposes GitHub repository
contributors as subscription recipients, split into **email** (to / cc / bcc) and
**SMS** (telephone numbers) channels.

---

## Tools

| Tool | Description |
|------|-------------|
| `set_github_token` | Store a GitHub PAT on the server (survives for the process lifetime) |
| `get_token_status` | Check whether a token is currently configured (safe — never reveals the value) |
| `get_recipients`   | Fetch contributors for an `owner/repo` and return email + SMS recipients |

### `get_recipients` response structure

```json
{
  "repository": "octocat/Hello-World",
  "contributor_count": 12,
  "email": {
    "to":  "last-committer@example.com",
    "cc":  ["contributor2@example.com", "contributor3@example.com"],
    "bcc": []
  },
  "sms": {
    "numbers": ["+14155550123"]
  },
  "warning": null
}
```

**Email split rules:**
- `to` — the single contributor who made the most recent commit on the default branch
- `cc` — every other contributor who has a public email address on their GitHub profile
- `bcc` — always empty in v1 (reserved for future use)

**SMS:** telephone numbers are scraped from the `blog` field on GitHub contributor profiles
(GitHub has no dedicated phone field; contributors sometimes put their number there).

---

## Quick start

### 1. Build the image

```bash
docker build -t subscription-mcp .
```

### 2a. Run in HTTP mode (direct API / ToolHive Inspector)

```bash
docker run --rm -p 8000:8000 \
  -e TRANSPORT=http \
  -e GITHUB_TOKEN=ghp_your_token_here \
  subscription-mcp
```

The server is now reachable at `http://localhost:8000`.

### 2b. Run with docker-compose (HTTP)

```bash
cp .env.example .env   # fill in GITHUB_TOKEN
docker compose --profile http up
```

---

## Transport modes

| `TRANSPORT` value | Use case |
|-------------------|----------|
| `stdio`            | Claude Desktop — launched per-session via `docker run -i` |
| `http`             | Direct HTTP clients, ToolHive MCP Inspector (default in Docker) |
| `sse`              | Legacy SSE transport |
| `streamable-http`  | Modern streamable HTTP (alternative to `http`) |

---

## Claude Desktop configuration

Add the following to your Claude Desktop `claude_desktop_config.json`
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "subscription-recipients": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "TRANSPORT=stdio",
        "-e", "GITHUB_TOKEN=ghp_your_token_here",
        "subscription-mcp"
      ]
    }
  }
}
```

> **Tip:** omit `GITHUB_TOKEN` from the config and call `set_github_token` inside
> the Claude conversation instead — that way the token never appears in a config file.

---

## ToolHive MCP Inspector

ToolHive (and its built-in MCP Inspector) connects over HTTP/SSE.

1. Start the server in HTTP mode (see above).
2. In ToolHive, add a new server with:
   - **URL:** `http://localhost:8000/sse`  (SSE endpoint)  
     or `http://localhost:8000/mcp` (streamable-HTTP endpoint)
   - **Auth:** Bearer token → paste the value of `MCP_API_KEY` (or leave blank if unset)

---

## Direct HTTP usage

### List available tools

```bash
# Open SSE stream (keep this running in one terminal)
curl -N http://localhost:8000/sse

# In another terminal, send a JSON-RPC tool-list request
curl -X POST http://localhost:8000/messages \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

### Call get_recipients

```bash
curl -X POST http://localhost:8000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "2",
    "method": "tools/call",
    "params": {
      "name": "get_recipients",
      "arguments": { "repository": "octocat/Hello-World" }
    }
  }'
```

### With bearer-token auth (when MCP_API_KEY is set)

```bash
curl -X POST http://localhost:8000/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key_here" \
  -d '{ ... }'
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | No* | — | GitHub PAT; required for private repos |
| `TRANSPORT` | No | `stdio` | Transport mode (see table above) |
| `PORT` | No | `8000` | HTTP listen port |
| `HOST` | No | `0.0.0.0` | HTTP listen address |
| `MCP_API_KEY` | No | — | Bearer token for HTTP auth; unset = open |

\* Without a token you get 60 unauthenticated requests/hour from the GitHub API.
For production use, always set a token.

---

## Development (no Docker)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# HTTP mode
TRANSPORT=http GITHUB_TOKEN=ghp_... python server.py

# stdio mode
TRANSPORT=stdio GITHUB_TOKEN=ghp_... python server.py
```

---

## GitHub token guide

1. Go to **GitHub → Settings → Developer settings → Personal access tokens**
2. For **public repos only**: no scopes required (or use a fine-grained token with no extra permissions)
3. For **private repos**: select the `repo` scope (classic) or grant read access to the target repo (fine-grained)
4. Copy the token and either:
   - Set `GITHUB_TOKEN=<token>` in your environment / `.env` file, or
   - Call `set_github_token` from within Claude after the server starts
