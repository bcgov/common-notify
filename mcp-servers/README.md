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

The adapter obtains a token from CSS using **Notify's dedicated service-account integration**. CSTAR
registers and trusts that client ID for selected read-only endpoints. CSTAR does not issue Notify
another secret, and this flow uses neither the browser user's JWT nor token exchange. The client
secret is sent only to CSS's token endpoint; CSTAR receives the resulting bearer token.

Provision these environment variables in the adapter:

- `MCP_API_KEY`: at least 32 characters; shared only with Notify.
- `CSTAR_API_URL`: CSTAR API origin.
- `CSTAR_TOKEN_URL`, `CSTAR_CLIENT_ID`, `CSTAR_CLIENT_SECRET`: OAuth2 client-credentials account.
- `CSTAR_SCOPE`: optional space-separated scopes.
- `PORT`: optional; defaults to 3101.

OAuth is implemented as `client_secret_post`. Confirm this method, audience/scope, service-account
group visibility and pagination with Chris/Shankar before deployment. Group discovery uses
`GET /api/v1/tenants/{tenantId}/groups`; member lookup uses the service-account-only
`GET /api/v1/tenants/{tenantId}/groups/{groupId}/users` endpoint. Its response is `data.users[]`
with a direct nullable `email` field (not `ssoUser.email`). One lookup is made per distinct group,
with at most four member requests in flight. Any failed/malformed group response fails the complete
recipient lookup. Only normalized, deduplicated emails are returned. The current upstream
implementation returns complete arrays; no pagination is implemented here.

## Live CSTAR DEV verification

CSTAR confirmed service-account and headless access for Notify in **DEV only**:

| Adapter variable      | DEV setting                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- |
| `CSTAR_API_URL`       | `https://dev.connect.digital.gov.bc.ca`                                               |
| `CSTAR_TOKEN_URL`     | `https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/token` |
| `CSTAR_CLIENT_ID`     | `notify-cstar-integration-6738`                                                       |
| `CSTAR_CLIENT_SECRET` | Supplied through the DEV OpenShift Secret; never commit it                            |

These are the **adapter-to-CSTAR** credentials, separate from `MCP_API_KEY`, the shared
Notify-to-adapter key. Do not copy the DEV account or endpoints into TEST/PROD. CSTAR requires the
tenant to have Notify associated, Notify's service-account client ID to be registered, and both
service-account access and headless access enabled in that environment. Tenant-agnostic
service-account roles do not remove those tenant/service association checks. Groups do not need
Notify roles: a workflow team that never signs into Notify can still be a recipient group. The
adapter validates tenant ownership, not whether members have Notify roles.

In the updated adapter pod's OpenShift Terminal, run this read-only check using a known **DEV
external tenant ID** and one of that tenant's **DEV group IDs**:

```sh
node src/verify-dev.js <DEV-tenant-id> <DEV-group-id>
```

It obtains a service-account token, lists groups and resolves the requested group's members. It
prints only counts and pass/fail; no secrets, tokens, user records or email addresses. It rejects
settings for another environment. An empty group can validly return zero emails; select a known
populated group to prove member retrieval. Failures include the upstream HTTP status without logging
the upstream body. Check token settings on 401; check CSTAR's four access conditions on 403; check
IDs/environment on 404. These are troubleshooting starting points, not definitive diagnoses of each
upstream status.

After that check succeeds, log into the matching tenant and confirm the event group picker loads the
expected groups. Use the read-only adapter verification above to check membership; the demo
recipient-preview UI has been removed. Also verify that an unassociated tenant/foreign group is
rejected and that the existing user-login tenant/role flows still work.

Deployment prerequisites: the adapter image must be published, the chart enabled, and the Secret
referenced by `cstarMcp.secretName` must exist in the release namespace. The PR and merge workflows
test, publish and import the adapter image alongside Notify, and the chart enables the adapter in
every environment. The PR frontend currently targets CSTAR TEST. A PR deploying in Notify DEV alone
does not prove it targets CSTAR DEV: align the frontend/user-login CSTAR settings and adapter
settings before the live test. TEST/PROD enablement needs separate CSTAR confirmation and
credentials.

## Local development

OpenShift Secrets are not automatically available on a developer's laptop. Use the **existing
Notify-owned CSS DEV service-account secret**, rather than creating a new account or copying a user
JWT. For a local DEV test, from the repo root:

```powershell
# Preserve an existing privately populated file.
if (-not (Test-Path mcp-servers/cstar/.env)) {
  Copy-Item mcp-servers/cstar/.env.example mcp-servers/cstar/.env
}
# Privately fill CSTAR_CLIENT_SECRET in that .env file before starting the adapter.
docker compose --env-file mcp-servers/cstar/.env -f .devcontainer/docker-compose.yml up -d --build --no-deps --force-recreate cstar-mcp
```

The example contains the confirmed DEV API/token URLs and Notify CSS client ID, but no secret. The
local `.env` is gitignored. Do not commit it or paste its contents into chat/logs. `--env-file`
supplies Compose interpolation; the adapter's standalone `.env` is not loaded by Compose
automatically. Existing PowerShell environment variables override the file: remove stale CSTAR
variables or ensure they target the same DEV account. Backend/frontend and their dependencies must
already be running when using `--no-deps` above.

Compose uses `CSTAR_MCP_API_KEY` (with a development-only default) for Notify-to-adapter
authentication, mapping it to the adapter's `MCP_API_KEY`. Leave that override unset to retain the
existing local shared key; if you change it, recreate the backend with the same setting as well. It
is unrelated to the CSS client secret. Use separately provisioned secrets in OpenShift.

Flyway V89 enables the built-in CSTAR destination automatically for both new and existing databases.
No manual registry activation is needed.

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

V88 creates `notify.mcp_server` and `notify.mcp_tool`. Each call reloads the enabled URL, transport,
credential reference, tool permission and parameter-name allowlist from these tables. There is no
destination URL in event code. Secret values remain in environment variables/OpenShift Secrets. The
seeded CSTAR entry is enabled automatically by V89. Existing event feature flags and tenant
authorization still apply; the `mcp_api` feature flag controls MCP administration.

An administrator can manage servers/tools through **Admin > MCP Servers**, protected by the
`mcp_api` feature flag and existing `NOTIFY_ADMIN` SSO role, and use the exported
`McpClientService.call()` without another protocol client. Only Streamable HTTP with bearer
credentials is implemented; other transports/auth schemes require explicit support. Registry editing
grants outbound network access and must remain restricted to trusted operators/super admins.

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

## OpenShift handoff

The existing PR/merge build matrix publishes `notify-cstar-mcp` from `cstar/Dockerfile`, imports it
into the tools ImageStream and promotes its tag with backend/frontend/migrations. PRs use the PR
number; main uses dev, then test, then prod. The adapter reads `CSTAR_API_URL` directly from
`app-api-secrets`, using the same key as Notify's backend. Do not duplicate that URL in the adapter
secret; the explicit mapping overrides any old value there.

Provision Secret `cstar-mcp-secrets` with `MCP_API_KEY`, `CSTAR_TOKEN_URL`, `CSTAR_CLIENT_ID`,
`CSTAR_CLIENT_SECRET`, and optional `CSTAR_SCOPE`. The backend chart reads `MCP_API_KEY` from that
same Secret as `CSTAR_MCP_API_KEY`. The CSS account and token endpoint must match the environment
selected by `app-api-secrets.CSTAR_API_URL`. The previous CSTAR client forwarded user tokens; it did
not establish a stored service-account credential mapping. Confirm the existing service-account
Secret/key before copying or remapping credentials. Do not commit secret values.

Event group workflows require the adapter; `cstarMcp.enabled` controls its deployment. The
image defaults to the release registry/repository/tag supplied by the existing deployer;
`cstarMcp.image` is an optional full-image override. Secrets must exist in each target namespace
before deployment. The service is internal (`<release>-cstar-mcp:3101`), with readiness and liveness
probes, rolling updates, non-root containers and no API-server token. Test/prod value files set
**two replicas**, preferred pod anti-affinity scoped to the release, and an enabled PDB keeps one
available during voluntary disruption. These are deployment manifests, not evidence of live HA;
coordinate quotas, placement, egress to CSTAR/SSO, secret rotation and image promotion with Nikhil.
No deployment or team messages have been sent as part of this change. V89 enables the CSTAR registry
entry during deployment.

Like Notify's ClamAV deployment, all adapter resources and selectors are scoped to the Helm release.
DEV/PR defaults to one replica, Recreate and no PDB. TEST/PROD uses two replicas, RollingUpdate and
a PDB with minAvailable 1. Configure these using cstarMcp.deploymentStrategy and cstarMcp.pdb.
Separate nodes are preferred, not required.

The backend chart supplies CSTAR_MCP_URL for its release's internal service. The MCP client uses
this only for the seeded http://cstar-mcp:3101/mcp registry destination; explicit custom registry
URLs remain authoritative. Local Compose continues to use cstar-mcp. No applied migration needs
editing. Existing deployments with the old fixed-name adapter should coordinate its retirement after
the release-specific deployment is ready; this change does not modify a live cluster.

MCP migrations use V87-V89 because main now owns V83-V86. Their SQL is unchanged.
If an earlier PR deployment already applied the MCP scripts as V83-V85, its Flyway history
must be reconciled before redeploying this branch; renaming files does not rewrite database
history. Do not run the conflicting versions against that existing history without an agreed
PR database reset or migration-history reconciliation. No live database was changed here.
