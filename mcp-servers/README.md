# Notify MCP servers

`cstar/` is a standalone, stateless MCP adapter. Notify is its client; it is not
mounted in Notify's HTTP process and has no database dependency. Notify's old
`/api/v1/mcp` notification-history prototype and its Kong route have been removed.
Tenant/role checks remain in Notify's existing CSTAR authorization client.

## Tool contract

Transport: Streamable HTTP, `POST /mcp`. Authenticate using
`Authorization: Bearer <MCP_API_KEY>`. The trusted Notify backend supplies
`x-tenant-id` using the authenticated tenant's **external CSTAR ID**. The key
allows its holder to supply tenant context; expose this service only to trusted
backend clients, never to browsers. User tokens are not forwarded to this server.

| Tool | Arguments | Structured result |
| --- | --- | --- |
| `list_groups` | `{}` | `{ "groups": [{ "id": "...", "name": "...", "description": "..." }] }` |
| `get_recipients` | `{ "groupIds": ["..."] }` (maximum 100 IDs) | `{ "emails": ["person@example.com"] }` |

Unknown fields are rejected, including tenant IDs supplied as tool arguments.
The adapter checks all groups belong to the supplied tenant before expanding
members. Emails are trimmed, lowercased, deduplicated and limited to the email
field; no arbitrary CSTAR user fields leave the adapter. Failures stop the send,
rather than silently sending to a subset. HTTP lookups and token requests have
10-second deadlines; the Notify MCP operation has a 15-second overall deadline.

## Service account configuration

Provision these environment variables in the adapter:

- `MCP_API_KEY`: at least 32 characters; shared only with Notify.
- `CSTAR_API_URL`: CSTAR API origin.
- `CSTAR_TOKEN_URL`, `CSTAR_CLIENT_ID`, `CSTAR_CLIENT_SECRET`: OAuth2 client-credentials account.
- `CSTAR_SCOPE`: optional space-separated scopes.
- `PORT`: optional; defaults to 3101.

OAuth is implemented as `client_secret_post`. Confirm this method, audience/scope,
service-account group visibility, environment URLs and endpoint pagination with
Chris/Shankar before deployment. The current adapter expects the complete
`data.groups` and `data.users` arrays used by the existing integration; it does
not implement a CSTAR pagination contract that has not yet been established.

## Local development

From the repo root, export the account settings above and `CSTAR_MCP_API_KEY`
(the Compose input used as the adapter's `MCP_API_KEY` and Notify's credential).
Compose has a development-only default MCP key; supply a real secret elsewhere.

```sh
docker compose -f .devcontainer/docker-compose.yml up -d --build cstar-mcp backend
```

After Flyway applies V78, enable the local destination once in the local database:

```sql
UPDATE notify.mcp_server SET enabled = TRUE WHERE name = 'cstar';
```

Notify calls `http://cstar-mcp:3101/mcp`; host-side MCP clients use
`http://localhost:3101/mcp` and must supply both headers. The existing event group
picker/save/send flows now use this adapter. `/health` checks process health
without calling CSTAR or requiring authentication.

```sh
cd mcp-servers/cstar
npm ci
npm test
docker build -t notify-cstar-mcp .
```

## Stored Notify client configuration

V78 creates `notify.mcp_server` and `notify.mcp_tool`. Each call reloads the
enabled URL, transport, credential reference, tool permission and parameter-name
allowlist from these tables. There is no destination URL in event code. Secret
values remain in environment variables/OpenShift Secrets. The seeded entry is
disabled until operators provision the adapter. Existing event feature flags and
tenant authorization still apply; the old `mcp_api` flag is no longer used.

An operator can register additional servers/tools through data changes and use
the exported `McpClientService.call()` without adding another protocol client.
The eventual super-admin screen is not included in this extraction. Only
Streamable HTTP with bearer credentials is implemented; other transports/auth
schemes require explicit support. Registry editing grants outbound network access
and must remain restricted to trusted operators/super admins.

When CSTAR offers a compatible MCP server, update the `cstar` row's URL and
credential reference. Its tool names, argument/result shapes and tenant-context
authentication must match this contract for that to be a data-only change.

## OpenShift handoff

Build/publish `cstar/Dockerfile`, then provision Secret `cstar-mcp-secrets` with
the adapter environment names above (including `MCP_API_KEY`). The backend chart
reads the same key as `CSTAR_MCP_API_KEY`. Do not commit secret values.

Enable `cstarMcp.enabled` and set `cstarMcp.image` in the app Helm release after
the image/secret exist. The service is internal (`cstar-mcp:3101`), with readiness
and liveness probes, rolling updates, non-root containers and no API-server token.
Test/prod value files set **two replicas**, node-spreading preferences, and a PDB
keeps one available during voluntary disruption. These are deployment manifests,
not evidence of live HA; coordinate quotas, placement, egress to CSTAR/SSO, secret
rotation and image promotion with Nikhil. No deployment or team messages have
been sent as part of this change. Enable the registry entry only after rollout.

Historical V77 is retained to avoid changing an already-applied Flyway checksum.
