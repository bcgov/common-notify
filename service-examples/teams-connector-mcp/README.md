# teams-connector-mcp

MCP server wrapping [devx-teams-connector](https://github.com/bcgov/devx-teams-connector) — a Bot Framework relay for posting notifications to Microsoft Teams.

## Prerequisites

- Access to a running instance of [devx-teams-connector](https://github.com/bcgov/devx-teams-connector) — by default this points at the BC Gov deployment at `https://relay.developer.gov.bc.ca`
- **For local Node.js:** Node.js ≥ 20
- **For Docker:** Docker Desktop ≥ 4.38 with Docker MCP Toolkit enabled
- **For ToolHive:** the [`thv` CLI](https://docs.stacklok.com/toolhive/) installed and Docker/Podman running

## Setup

```bash
cp .env.example .env
# Edit .env — set CONNECTOR_API_KEY (and, if not using the default deployment, TEAMS_CONNECTOR_URL)
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `CONNECTOR_API_KEY` | Yes | Bearer token matching `CONNECTOR_API_KEY` on the connector |
| `TEAMS_CONNECTOR_URL` | No | Base URL of the connector. Defaults to `https://relay.developer.gov.bc.ca` |

## Run

### Local Node.js

```bash
npm install

# Development (tsx, no build step)
npm run dev

# Production
npm run build
npm start
```

### Docker — standalone (stdio)

Build the image once, then run it directly. Claude Desktop / Claude Code launch the container per-session via stdin/stdout.

```powershell
# Build
docker build -t teams-connector-mcp:latest .

# Test manually
docker run --rm -i `
  -e CONNECTOR_API_KEY=your-api-key `
  teams-connector-mcp:latest
```

### Docker — Docker MCP Toolkit (gateway / SSE)

Uses [docker/mcp-gateway](https://github.com/docker/mcp-gateway) to expose the server over SSE so multiple clients can connect simultaneously.

```powershell
# 1. Build the server image
docker compose --profile build build

# 2. Start the gateway (listens on http://localhost:8811/sse)
docker compose --profile gateway up -d

# 3. Stop
docker compose --profile gateway down
```

The gateway reads `CONNECTOR_API_KEY` (and, if set, `TEAMS_CONNECTOR_URL`) from your `.env` file (via Docker secrets) and injects them into the server container.

### ToolHive

[ToolHive](https://docs.stacklok.com/toolhive/) runs the server as a managed, sandboxed workload and exposes
it over streamable-HTTP, auto-converted from the container's stdio transport. No registry entry is needed —
`thv run` accepts a local image reference directly.

```bash
# 1. Build the server image (same image as the standalone/gateway paths)
docker build -t teams-connector-mcp:latest .

# 2. Create an env file with the plain variable names ToolHive passes through as-is
cp .env.toolhive.example .env.toolhive
# Edit .env.toolhive — set CONNECTOR_API_KEY (and, if not using the default deployment, TEAMS_CONNECTOR_URL)

# 3. Run it
thv run --name teams-connector --transport stdio --env-file .env.toolhive teams-connector-mcp:latest

# 4. Confirm it's up
thv list

# 5. Stop it
thv stop teams-connector
thv rm teams-connector
```

`.env.toolhive` uses the plain `CONNECTOR_API_KEY` name — this is a separate file from the Docker MCP
Toolkit gateway's `.env`, which requires the dotted `teams-connector.connector_api_key` secret name instead
(see the gateway section above). Don't reuse one file for both paths.

#### Querying it with the ToolHive Inspector

```bash
thv inspector teams-connector
```

This pulls and starts the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) container,
connects it to the running `teams-connector` workload, and prints a URL like:

```
Inspector UI is now available at http://localhost:6274?transport=streamable-http&serverUrl=http://host.docker.internal:<port>/mcp&MCP_PROXY_AUTH_TOKEN=<token>
```

Open that URL in a browser to browse the `health` and `sendMessage` tool schemas and call them
interactively. For scripted/CLI testing instead of the browser UI:

```bash
thv mcp list tools --server teams-connector
thv mcp call health --server teams-connector
```

## MCP client configuration

### Option A — Docker standalone (recommended for Claude Desktop / Claude Code on Windows)

Add to `claude_desktop_config.json` (or `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "teams-connector": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "CONNECTOR_API_KEY",
        "teams-connector-mcp:latest"
      ],
      "env": {
        "CONNECTOR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Option B — Docker MCP Gateway (SSE)

After starting the gateway with `docker compose --profile gateway up -d`, the gateway requires a bearer
token for every request — it's printed to the container logs on each startup and changes every time the
gateway restarts:

```bash
docker compose --profile gateway logs | grep "Bearer token"
```

```json
{
  "mcpServers": {
    "teams-connector": {
      "url": "http://localhost:8811/sse",
      "headers": {
        "Authorization": "Bearer <token-from-logs>"
      }
    }
  }
}
```

If your client doesn't support custom headers for SSE servers, start the gateway with
`--allow-unauthenticated` added to the `command:` list in `compose.yml` instead (local development only —
this removes the auth requirement entirely).

### Option C — Local Node.js

```json
{
  "mcpServers": {
    "teams-connector": {
      "command": "node",
      "args": ["/path/to/teams-connector-mcp/dist/index.js"],
      "env": {
        "CONNECTOR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Exposed tools

### `health`

Calls `GET /health` on the connector. No parameters, no authentication required.

### `send_*_message` tools

Each tool below posts a notification to a Teams channel via `POST /api/v1/messages` (or
`POST /api/v1/messages/preview` when `preview: true`). Every tool shares the same target and common
parameters, plus its own content-specific fields.

#### Common parameters (every `send_*_message` tool)

| Parameter | Required | Type | Description |
|---|---|---|---|
| `teamId` | Yes | `string` (UUID) | Microsoft Teams team ID |
| `channelId` | Yes | `string` | Teams channel ID, e.g. `19:abc@thread.tacv2` |
| `mentions` | No | `Array<{ id: string, name: string }>` | Up to 10 users to @mention |
| `metadata` | No | `Record<string, string>` | Up to 20 key-value metadata pairs |
| `preview` | No | `boolean` | When `true`, validates without delivering (calls `/preview` endpoint) |

#### `send_text_message`

| Parameter | Required | Description |
|---|---|---|
| `text` | Yes | Message body (max 10,000 chars) |

#### `send_html_message`

| Parameter | Required | Description |
|---|---|---|
| `text` | Yes | HTML-formatted message body (max 10,000 chars) |

#### `send_card_message`

| Parameter | Required | Description |
|---|---|---|
| `cardJson` | Yes | JSON string of a Microsoft Adaptive Card. Requires `ALLOW_CARD_PASSTHROUGH=true` on the connector. |

#### `send_generic_message`

| Parameter | Required | Description |
|---|---|---|
| `title` | Yes | Notification title |
| `body` | No | Notification body text |
| `severity` | No | Severity level, e.g. `critical`, `warning`, `info` |
| `url` | No | Link URL |
| `urlLabel` | No | Label for the link |
| `source` | No | Source system name |

#### `send_github_pull_request_message`

| Parameter | Required | Description |
|---|---|---|
| `event` | Yes | PR event type, e.g. `opened`, `merged`, `closed` |
| `title` | Yes | Pull request title |
| `repo` | Yes | Repository full name, e.g. `org/repo` |
| `author` | Yes | PR author username |
| `url` | Yes | URL to the pull request |
| `body` | No | PR description or comment body |

#### `send_github_workflow_run_message`

| Parameter | Required | Description |
|---|---|---|
| `event` | Yes | Workflow event type, e.g. `workflow_run` |
| `workflow` | Yes | Workflow name |
| `repo` | Yes | Repository full name, e.g. `org/repo` |
| `branch` | Yes | Branch that triggered the workflow |
| `author` | Yes | Actor who triggered the run |
| `url` | Yes | URL to the workflow run |
| `conclusion` | No | Workflow run conclusion, e.g. `success`, `failure` |
| `sha` | No | Commit SHA |
| `message` | No | Commit message |

#### `send_sysdig_message`

| Parameter | Required | Description |
|---|---|---|
| `severity` | Yes | Alert severity number |
| `alertName` | Yes | Name of the Sysdig alert |
| `state` | No | Alert state, e.g. `ACTIVE`, `RESOLVED` |
| `scope` | No | Scope expression |
| `description` | No | Alert description |
| `timestamp` | No | ISO 8601 timestamp |
| `url` | No | Link to the alert in Sysdig |

#### `send_uptime_message`

| Parameter | Required | Description |
|---|---|---|
| `status` | Yes | Current service status: `up` \| `down` |
| `service` | Yes | Service name or URL |
| `downSince` | No | ISO 8601 timestamp when the service went down |
| `url` | No | Link to the uptime dashboard |

#### `send_db_backup_message`

| Parameter | Required | Description |
|---|---|---|
| `status` | Yes | Backup status, e.g. `success`, `failure` |
| `projectName` | Yes | OpenShift/project short name |
| `projectFriendlyName` | Yes | Human-readable project name |
| `message` | No | Additional status message |

#### `send_argocd_message`

| Parameter | Required | Description |
|---|---|---|
| `event` | Yes | ArgoCD event type, e.g. `app.sync.succeeded` |
| `application` | Yes | ArgoCD application name |
| `syncStatus` | No | Sync status, e.g. `Synced`, `OutOfSync` |
| `healthStatus` | No | Health status, e.g. `Healthy`, `Degraded` |
| `revision` | No | Git revision/commit SHA |
| `project` | No | ArgoCD project name |
| `target` | No | Sync target revision or branch |
| `timestamp` | No | ISO 8601 event timestamp |
| `message` | No | Additional event message |
| `url` | No | Link to the application in ArgoCD |
