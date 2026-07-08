# mcp-console

A standalone internal web UI for registering, browsing, and manually testing MCP (Model Context
Protocol) servers — not specific to [`teams-connector-mcp`](../teams-connector-mcp), works against any
MCP server exposing streamable-HTTP or SSE transport.

**No authentication.** This is an internal, no-authz prototype tool — do not expose it outside a trusted
network.

## What it does

Two roles, two sets of pages (there's no login — which page you use *is* the role, consistent with this
being a no-authz internal tool):

**Global admin** (`/`, `/add-service`, `/services/:id`)
1. **Add service** — register an MCP server (shortname, URL, transport, **category**, API key). Category
   is one of four fixed values chosen at registration time: `msgApp` (3rd party messaging apps),
   `subscription` (Subscription services), `template` (Template services), `attachment` (Attachment
   services) — shown in the registered-servers table. The console connects, discovers the server's full
   tool list, and lets you pick which tools to enable.
2. **Configure service** has an **Edit enabled tools** button — re-discovers the server's full tool list
   live (using its stored credentials, never re-entered) and lets you change which tools are enabled at
   any time after initial registration, not just when the service is first added.
3. Pick one of the enabled tools, fill in a form generated from its JSON Schema
   (required parameters grouped above optional ones, each with its name and description; a `preview`
   parameter, if the tool has one, renders as its own checkbox directly above the action buttons instead
   of mixed into the parameter list). **Test** actually invokes the tool and shows the raw result. **Save
   as global default** persists the current field values — once saved, that parameter is locked: no
   tenant admin can override it.

**Tenant admin** (`/tenant`, `/tenant/services/:id`)
1. Enter a tenant name (no login — just an identifier, stored in the URL and remembered in
   `localStorage`). The "add a service" table can be filtered by category and shows each available
   service's category; **add** one to make it available to configure.
2. **Configure** — same tool form as the global admin, restricted to that service's enabled tools.
   Parameters already locked by the global admin render disabled with a "Locked by global admin" badge,
   pre-filled with the global value. Everything else is editable; **Save my defaults** persists the
   tenant's own values, which reload the next time that tenant opens the same tool (or the page is
   refreshed) — nothing is lost between page visits. One tool per service can be marked **the default
   tool** ("Set as default tool") — setting a new one replaces the previous default, never adds a second.
3. Back on the tenant's main page, each added service with a default tool assigned gets a **Test** button
   next to **Configure** (disabled until a default tool is set). It opens a modal with that tool's full
   parameter form — identical behaviour to the Test button on the Configure page — so a tenant admin can
   invoke the default tool without navigating away from the service list.

## Architecture

- `backend/` — NestJS + TypeORM. Stores the registry (encrypted API keys) in Postgres and proxies all
  MCP protocol calls via `@modelcontextprotocol/sdk`, so API keys never reach the browser. **Deployed as
  a single container with its own Postgres inside it** (chosen for deployment simplicity for this
  internal tool — see the note in `backend/Dockerfile` for the tradeoffs).
- `frontend/` — React + Vite + TanStack Router + Bootstrap 5 + `@bcgov/design-system-react-components`,
  matching the stack of the main Notify frontend for visual/tooling consistency (without its
  Keycloak/tenant machinery, which doesn't apply here). Deployed as its own container (static build
  served by nginx).
- `compose.yml` — the two containers above by default, plus a `--profile dev` standalone Postgres for
  local development (see below).

## Prerequisites

- Docker Desktop
- Node.js ≥ 20 (only needed for the local-development flow below)

## Setup — default deployment (2 containers)

```bash
cp .env.example .env
# Edit .env — set ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

docker compose up -d --build
```

- Frontend: http://localhost:8080
- Backend: http://localhost:3100

The `backend` container runs Postgres and the NestJS API in the same container (data persisted in the
`mcp-console-pgdata` volume across restarts) and runs migrations automatically on startup, before the
API starts listening. The `frontend` container's nginx proxies `/api` to the `backend` container over
the Docker network.

**Registered MCP server URLs**: since the backend now runs inside a container, `localhost`/`127.0.0.1`
in a registered server's URL won't reach a server running on your host machine — use
`host.docker.internal` instead (available by default on Docker Desktop).

## Local development (hot reload)

For iterating on the backend/frontend themselves, run them un-containerized so `localhost` URLs for
MCP servers on your own machine work exactly like a curl command would, and so you get hot reload:

```bash
# 1. Postgres only
docker compose --profile dev up -d postgres-dev

# 2. Backend
cd backend
cp .env.example .env
# Edit .env — set ENCRYPTION_KEY (same as above) and POSTGRES_PORT=5433
npm install
npm run migration:run
npm run start:dev          # http://localhost:3100

# 3. Frontend (separate terminal)
cd ../frontend
npm install
npm run dev                # http://localhost:5180
```

## Environment variables

### Root `.env` (read by `compose.yml`)

| Variable | Required | Description |
|---|---|---|
| `ENCRYPTION_KEY` | Yes | 64-character hex string (32 bytes) used to encrypt registered API keys at rest |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DATABASE` | No | Default `mcp_console` / `mcp_console` / `mcp_console` |
| `POSTGRES_PORT` | No | Only used by `postgres-dev` (`--profile dev`). Default `5433` |

### `backend/.env` (local development only)

| Variable | Required | Description |
|---|---|---|
| `ENCRYPTION_KEY` | Yes | Same as above |
| `POSTGRES_HOST` | No | Default `localhost` |
| `POSTGRES_PORT` | No | Default `5433` (matches `postgres-dev`'s mapped port) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DATABASE` | No | Default `mcp_console` / `mcp_console` / `mcp_console` |
| `PORT` | No | Default `3100` |

### `frontend/.env` (local development only)

| Variable | Required | Description |
|---|---|---|
| `VITE_MCP_CONSOLE_API_URL` | No | Dev-server proxy target for `/api`. Default `http://localhost:3100` |

## API key security

Registered API keys are encrypted at rest (AES-256-GCM) and never returned by any `GET` endpoint. This
protects against casual access to a DB dump/backup — it is not a defense against a compromised backend
process, which can always decrypt (the key lives in its own env). Full secrets-manager integration is
out of scope for this internal tool.

## Backend API

| Endpoint | Description |
|---|---|
| `GET /api/mcp-servers` | List registered servers (no API keys returned) |
| `GET /api/mcp-servers/:id` | Get one registered server |
| `POST /api/mcp-servers` | Save a new registration (`shortName`, `url`, `transport`, `category`, `apiKey`, `enabledTools`) |
| `PATCH /api/mcp-servers/:id/enabled-tools` | Update which tools are enabled for an already-registered service: `{ enabledTools }` |
| `POST /api/mcp-client/discover` | Stateless pre-flight: connect to `{url, transport, apiKey}` and return its full tool list |
| `GET /api/mcp-client/:id/tools` | Live `tools/list` for a registered server, filtered to its enabled subset |
| `GET /api/mcp-client/:id/all-tools` | Live `tools/list` for a registered server, unfiltered — used by "Edit enabled tools" since the browser never has the raw API key needed for `/discover` |
| `POST /api/mcp-client/:id/execute` | Call a tool (`toolName`, `arguments`) and return the raw result |
| `GET /api/mcp-servers/:id/tools/:toolName/defaults?tenant=<name>` | Returns `{ global, tenant }` parameter value maps. `tenant` is optional — omit it for the global admin's own view |
| `POST /api/mcp-servers/:id/tools/:toolName/defaults` | Upsert parameter defaults: `{ scope: 'global' \| 'tenant', tenantName?, values }`. When `scope: 'tenant'`, any parameter already locked at `global` scope is silently dropped — a tenant can't override a lock even via a direct API call |
| `GET /api/tenant-services?tenant=<name>` | List the services a tenant has added |
| `POST /api/tenant-services` | Add a globally-registered service to a tenant: `{ tenantName, serverId }` |
| `POST /api/tenant-services/default-tool` | Set a tenant's default tool for a service: `{ tenantName, serverId, toolName }` — replaces any previous default, validated against the service's enabled tools |

### Parameter defaults data model

One table, `tool_parameter_default`, keyed by `(serverId, toolName, parameterName, tenantName)` — global
locks use an empty-string `tenantName` sentinel (not `NULL`, so the unique index actually enforces
uniqueness; Postgres treats multiple `NULL`s in a unique index as distinct). A save only writes the keys
present in the request — clearing a previously-saved default isn't supported yet (not needed for the
current UI, which never asks to "unset" a field, only to leave it blank on the next save).
