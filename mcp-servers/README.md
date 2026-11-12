# Notify MCP servers

`cstar/` is a standalone, stateless MCP adapter. Notify is its client; it is not mounted in Notify's
HTTP process and has no database dependency. Notify's old `/api/v1/mcp` notification-history
prototype and its Kong route have been removed. Tenant/role checks remain in Notify's existing CSTAR
authorization client.

## Tool contract

Transport: Streamable HTTP, `POST /mcp`. Authenticate using `Authorization: Bearer <MCP_API_KEY>`.
The trusted Notify backend supplies `x-tenant-id` using the authenticated tenant's **external CSTAR
ID**. The key allows its holder to supply tenant context; expose this service only to trusted
backend clients, never to browsers. User tokens are not forwarded to this server.

| Tool             | Arguments                                   | Structured result                                                      |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `list_groups`    | `{}`                                        | `{ "groups": [{ "id": "...", "name": "...", "description": "..." }] }` |
| `get_recipients` | `{ "groupIds": ["..."] }` (maximum 100 IDs) | `{ "emails": ["person@example.com"] }`                                 |

Unknown fields are rejected, including tenant IDs supplied as tool arguments. The adapter checks all
groups belong to the supplied tenant before expanding members. Emails are trimmed, lowercased,
deduplicated and limited to the email field; no arbitrary CSTAR user fields leave the adapter.
Failures stop the send, rather than silently sending to a subset. HTTP lookups and token requests
have 10-second deadlines; the Notify MCP operation has a 15-second overall deadline.

## Service account configuration

Provision these environment variables in the adapter:

- `MCP_API_KEY`: at least 32 characters; shared only with Notify.
- `CSTAR_API_URL`: CSTAR API origin.
- `CSTAR_TOKEN_URL`, `CSTAR_CLIENT_ID`, `CSTAR_CLIENT_SECRET`: OAuth2 client-credentials account.
- `CSTAR_SCOPE`: optional space-separated scopes.
- `PORT`: optional; defaults to 3101.

OAuth is implemented as `client_secret_post`. Confirm this method, audience/scope, service-account
group visibility, environment URLs and endpoint pagination with Chris/Shankar before deployment. The
current adapter expects the complete `data.groups` and `data.users` arrays used by the existing
integration; it does not implement a CSTAR pagination contract that has not yet been established.

## Local development

From the repo root, export the account settings above and `CSTAR_MCP_API_KEY` (the Compose input
used as the adapter's `MCP_API_KEY` and Notify's credential). Compose has a development-only default
MCP key; supply a real secret elsewhere.

```sh
docker compose -f .devcontainer/docker-compose.yml up -d --build cstar-mcp backend
```

After Flyway applies V78, enable the local destination once in the local database:

```sql
UPDATE notify.mcp_server SET enabled = TRUE WHERE name = 'cstar';
```

Notify calls `http://cstar-mcp:3101/mcp`; host-side MCP clients use `http://localhost:3101/mcp` and
must supply both headers. The existing event group picker/save/send flows now use this adapter.
`/health` checks process health without calling CSTAR or requiring authentication.

```sh
cd mcp-servers/cstar
npm ci
npm test
docker build -t notify-cstar-mcp .
```

## Stored Notify client configuration

V78 creates `notify.mcp_server` and `notify.mcp_tool`. Each call reloads the enabled URL, transport,
credential reference, tool permission and parameter-name allowlist from these tables. There is no
destination URL in event code. Secret values remain in environment variables/OpenShift Secrets. The
seeded entry is disabled until operators provision the adapter. Existing event feature flags and
tenant authorization still apply; the old `mcp_api` flag is no longer used.

An operator can register additional servers/tools through data changes and use the exported
`McpClientService.call()` without adding another protocol client. The eventual super-admin screen is
not included in this extraction. Only Streamable HTTP with bearer credentials is implemented; other
transports/auth schemes require explicit support. Registry editing grants outbound network access
and must remain restricted to trusted operators/super admins.

When CSTAR offers a compatible MCP server, update the `cstar` row's URL and credential reference.
Its tool names, argument/result shapes and tenant-context authentication must match this contract
for that to be a data-only change.

## Registry safety rules

Credential names must match `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*_MCP_API_KEY$` before any environment
access. Single-label hosts and names ending in `.svc` or `.svc.cluster.local` allow HTTP or HTTPS.
Other hosts require HTTPS and an exact match in `MCP_ALLOWED_HOSTS` (comma-separated, trimmed,
lowercased; empty by default). IPv4/IPv6 literals are rejected even if allowlisted; `localhost` is
also rejected when `NODE_ENV=production`. Malformed URLs and other schemes are rejected before
connecting; redirects remain disabled.

## Local demo: real login, fictional groups and emails

Authentication is unchanged: Keycloak validates login, CSTAR supplies your tenants,
Notify syncs those tenants to its database, and CSTAR roles authorize event access.
The mock replaces only the adapter's group/member client. It does not invent login
permissions, grant access to other tenants, or change production configuration.

1. Sign in normally at `http://localhost:3000` and select your real tenant.
   Obtain its **external CSTAR tenant ID** from the response to
   `/api/v1/frontend/auth/tenants` (the tenant object's `id`), or from the local
   `notify.tenant.external_id` column. Do not use Notify's internal database UUID.
2. In PowerShell at the repo root, enable fixtures for that tenant:

   ```powershell
   $env:CSTAR_MOCK_MODE = 'true'
   $env:CSTAR_MOCK_TENANT_IDS = '<external-cstar-tenant-id>'
   docker compose -f .devcontainer/docker-compose.yml up -d --build cstar-mcp backend frontend
   docker compose -f .devcontainer/docker-compose.yml run --rm kong-routes
   ```

   Compose supplies `NODE_ENV=development`; the adapter refuses mock mode in other
   environments. Multiple demo tenants can be configured with comma-separated IDs.
   No CSTAR service-account credentials are needed for fixture lookup. The shared
   MCP bearer key is still required and uses the local Compose default if unset.
   Flyway V78 must already have created the registry tables.
3. With an SSO NOTIFY_ADMIN account, open **Admin > MCP Servers > Edit cstar**.
   Verify URL `http://cstar-mcp:3101/mcp`, credential reference `CSTAR_MCP_API_KEY`,
   enabled tools `list_groups` (no parameters) and `get_recipients` (`groupIds`).
   Check **Server enabled** and **Save server**. This replaces the manual SQL step.
   Non-admin users cannot edit the registry, even by calling the API directly.
4. Open **Notification Events**, create an event, then open **Email Notification**.
   Choose **CSTAR Group(s)**, enable **To**, and select **Demo Operations** and
   **Demo Communications**. Click **Preview group recipients**. Three unique
   fictional `example.invalid` emails appear; Sam belongs to both groups but is
   returned once. The preview makes a real MCP call but sends no notification.
5. Select a sender and template as normal and save the email settings. This calls
   `list_groups` again to verify ownership and stores only group IDs. Reopen the
   event to demonstrate persistence. **Test Send** still uses its explicitly chosen
   test recipient rather than expanding groups; the new preview demonstrates
   `get_recipients` without attempting delivery to fictional addresses.
6. Disable the registry server in Admin and repeat discovery/preview to show a
   failure; re-enable it to restore the flow. Initial picker loading retains the
   existing UI's silent error handling; preview has an explicit error message.

Fixtures are tenant-specific, include an empty group, and reject another tenant's
IDs. No fixture values are inserted into CSTAR or the Notify tenant directory.
To return to live lookup, unset `CSTAR_MOCK_MODE` and `CSTAR_MOCK_TENANT_IDS`, supply
real service-account settings, and recreate the adapter with Compose.
The adapter's `/health` remains a process check, not proof of CSTAR availability.

## OpenShift handoff

Build/publish `cstar/Dockerfile`, then provision Secret `cstar-mcp-secrets` with the adapter
environment names above (including `MCP_API_KEY`). The backend chart reads the same key as
`CSTAR_MCP_API_KEY`. Do not commit secret values.

Enable `cstarMcp.enabled` and set `cstarMcp.image` in the app Helm release after the image/secret
exist. The service is internal (`cstar-mcp:3101`), with readiness and liveness probes, rolling
updates, non-root containers and no API-server token. Test/prod value files set **two replicas**,
node-spreading preferences, and a PDB keeps one available during voluntary disruption. These are
deployment manifests, not evidence of live HA; coordinate quotas, placement, egress to CSTAR/SSO,
secret rotation and image promotion with Nikhil. No deployment or team messages have been sent as
part of this change. Enable the registry entry only after rollout.

Historical V77 is retained to avoid changing an already-applied Flyway checksum.
