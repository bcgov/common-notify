# API Gateway Configuration

Automated API Gateway configuration management for BC Gov API Gateway.

## Overview

This directory contains templates and automation for managing API Gateway configurations across DEV, TEST, and PROD environments.

**Key Features:**
- Single source of truth template (`gateway-routes.template.yaml`)
- Environment-specific value files (`envs/*.env`)
- Automated config generation and deployment via GitHub Actions
- PR-specific gateway configs for isolated testing
- Automatic cleanup on PR close/merge

## Gateway Architecture

### Current Gateway: `gw-fe8c5`

The Common Notify service uses the **`gw-fe8c5`** gateway (published and operational) for all environments:

| Environment | Gateway URL | Backend Service |
|------------|-------------|-----------------|
| **DEV** | `https://gw-fe8c5-notify.dev.api.gov.bc.ca` | `common-notify-dev-backend.f6bc3f-dev.svc.cluster.local` |
| **TEST** | `https://gw-fe8c5-notify.test.api.gov.bc.ca` | `common-notify-test-backend.f6bc3f-test.svc.cluster.local` |
| **PROD** | `https://gw-fe8c5-notify.api.gov.bc.ca` | `common-notify-prod-backend.f6bc3f-prod.svc.cluster.local` |
| **PR-{N}** | `https://gw-fe8c5-notify.dev.api.gov.bc.ca` | `common-notify-{N}-backend.f6bc3f-dev.svc.cluster.local` |

**Health Check Endpoints:**
```bash
# Public health endpoints (no authentication required)
curl https://gw-fe8c5-notify.dev.api.gov.bc.ca/api/health
curl https://gw-fe8c5-notify.test.api.gov.bc.ca/api/health
curl https://gw-fe8c5-notify.api.gov.bc.ca/api/health
```

## PR Isolation Strategy

### How PR Gateway Isolation Works

Each PR gets isolated gateway routes within the shared `gw-fe8c5` gateway:

```
┌─────────────────────────────────────────┐
│      gw-fe8c5 Gateway (Shared)          │
├─────────────────────────────────────────┤
│  PR-29 Routes:                          │
│    - gw-fe8c5-pr-29-notify-simple       │
│    - gw-fe8c5-pr-29-notify-event        │
│    - gw-fe8c5-pr-29-ches-email          │
│    ↓ Backend: pr-29-backend pod         │
├─────────────────────────────────────────┤
│  PR-30 Routes:                          │
│    - gw-fe8c5-pr-30-notify-simple       │
│    - gw-fe8c5-pr-30-notify-event        │
│    - gw-fe8c5-pr-30-ches-email          │
│    ↓ Backend: pr-30-backend pod         │
├─────────────────────────────────────────┤
│  DEV Routes:                            │
│    - gw-fe8c5-dev-notify-simple         │
│    - gw-fe8c5-dev-notify-event          │
│    - gw-fe8c5-dev-ches-email            │
│    ↓ Backend: dev-backend pod           │
└─────────────────────────────────────────┘
```

### Isolation Mechanisms

**1. Unique Route Prefixes**
- Each PR: `gw-fe8c5-pr-{NUMBER}-{route}`
- DEV: `gw-fe8c5-dev-{route}`
- TEST: `gw-fe8c5-test-{route}`
- PROD: `gw-fe8c5-prod-{route}`

**2. Environment-Specific Tags**
```yaml
tags: [ns.gw-fe8c5, env.dev]    # DEV routes
tags: [ns.gw-fe8c5, env.test]   # TEST routes
tags: [ns.gw-fe8c5, env.prod]   # PROD routes
```

**3. Backend Pod Isolation**
- Each PR deploys to its own Kubernetes pod
- Resource limits applied per pod
- Pod failures don't affect other PRs

**4. Authentication Requirement**
- All routes (except health checks) require JWT authentication
- Tokens issued by Keycloak for authorized consumers only
- Not publicly accessible

**5. Automatic Cleanup**
- Routes automatically deleted when PR closes
- Prevents resource accumulation
- Workflow: `.github/workflows/pr-close.yml`

### Current Protection Levels

✅ **Route Isolation:** Unique prefixes prevent route conflicts
✅ **Backend Isolation:** Separate pods with resource limits
✅ **Authentication:** JWT required for all API endpoints
✅ **Automatic Cleanup:** Routes deleted on PR close
✅ **Environment Tags:** Prevents cross-environment conflicts
⚠️ **Rate Limiting:** Not currently enforced (see Advanced Configuration)

### When Is This Sufficient?

The current isolation is adequate for:
- ✅ Developer testing and validation
- ✅ PR preview deployments
- ✅ Integration testing
- ✅ Preventing accidental cross-PR interference

Consider adding rate limiting if:
- ⚠️ PRs start experiencing performance issues
- ⚠️ Need to prevent runaway test scripts
- ⚠️ Require strict resource quotas per PR

## Security & Authentication

### Authentication Flow

All API endpoints (except `/health` and `/api/health`) require JWT authentication:

```
Client → Keycloak (Token Endpoint)
           ↓
       JWT Token
           ↓
Client → API Gateway → Backend Service
           ↑
      JWT Validation
```

### Keycloak Configuration

| Environment | Issuer | Audience |
|------------|--------|----------|
| DEV | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-gw-fe8c5-default-dev-dev` |
| TEST | `https://test.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-gw-fe8c5-default-test-test` |
| PROD | `https://loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-gw-fe8c5-default-prod-prod` |

### Consumer Headers

The gateway automatically injects consumer identity headers:
```
X-Consumer-Username: {consumer_username}
X-Consumer-ID: {consumer_id}
```

Backend services can use these headers for tenant identification and audit logging.

## Monitoring & Observability

### Health Monitoring

**Check Gateway Availability:**
```bash
# DEV
curl -i https://gw-fe8c5-notify.dev.api.gov.bc.ca/api/health

# TEST
curl -i https://gw-fe8c5-notify.test.api.gov.bc.ca/api/health

# PROD
curl -i https://gw-fe8c5-notify.api.gov.bc.ca/api/health
```

Expected response:
```json
HTTP/2 200 OK
{"status":"ok"}
```

### PR Gateway Verification

**Verify PR routes are created:**
```bash
# Login to API Gateway
gwa login --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET

# Set gateway context
gwa config set gateway gw-fe8c5

# List all routes (look for pr-{NUMBER} prefixes)
gwa gateway routes
```

### Workflow Monitoring

**PR Workflow:**
1. PR opened → Check `gateway-config` job in Actions tab
2. Look for: `✅ Gateway configuration generated successfully!`
3. Verify: `gwa apply` completes without errors

**PR Cleanup:**
1. PR closed → Check `gateway-cleanup` job
2. Look for: `Gateway config deleted` or `may not exist` (both OK)

### Common Issues

**503 Service Unavailable**
- Cause: Backend pod not running
- Check: `kubectl get pods -n f6bc3f-dev | grep pr-{NUMBER}`
- Fix: Verify deployment succeeded in Actions

**401 Unauthorized**
- Cause: Invalid or missing JWT token
- Check: Token issuer matches environment
- Fix: Request new token from correct Keycloak realm

**404 Not Found**
- Cause: Route doesn't exist or wrong path
- Check: Verify gateway config applied successfully
- Fix: Regenerate and reapply gateway config

## Advanced Configuration

### Adding Rate Limiting (Future Use)

If you need to add rate limiting to protect against excessive requests:

**1. Edit `api-gateway/templates/routes.yaml`:**

Add after the `request-transformer` plugin:
```yaml
  - name: rate-limiting
    tags: [ns.${GATEWAY_ID}, env.${ENVIRONMENT}]
    enabled: true
    config:
      second: 100      # Max 100 requests per second
      minute: 1000     # Max 1000 requests per minute
      hour: 10000      # Max 10000 requests per hour
      policy: local
      fault_tolerant: true
      hide_client_headers: false
```

**2. Apply to specific environments:**

For PR-only rate limiting, use conditional configuration:
```yaml
  - name: rate-limiting
    tags: [ns.${GATEWAY_ID}, env.dev]  # Only DEV (includes PRs)
    enabled: true
    config:
      second: 50
      minute: 500
```

**3. Test rate limiting:**
```bash
# Send rapid requests
for i in {1..60}; do
  curl -H "Authorization: Bearer $TOKEN" \
       https://gw-fe8c5-notify.dev.api.gov.bc.ca/api/v1/notifysimple
done

# Should see 429 Too Many Requests after limit
```

### Adding Request Size Limits

Protect against large payloads:
```yaml
  - name: request-size-limiting
    tags: [ns.${GATEWAY_ID}, env.${ENVIRONMENT}]
    enabled: true
    config:
      allowed_payload_size: 10    # 10 MB max
      size_unit: megabytes
      require_content_length: false
```

### Adding Request Correlation IDs

For distributed tracing:
```yaml
  - name: correlation-id
    tags: [ns.${GATEWAY_ID}, env.${ENVIRONMENT}]
    enabled: true
    config:
      header_name: X-Correlation-ID
      generator: uuid
      echo_downstream: true
```

### Custom Plugin Configuration

See [Kong Plugin Hub](https://docs.konghq.com/hub/) for all available plugins.

Common plugins for API gateways:
- `rate-limiting` - Request rate limits
- `request-size-limiting` - Payload size limits
- `ip-restriction` - IP allowlist/blocklist
- `cors` - Cross-origin resource sharing
- `bot-detection` - Bot traffic filtering
- `prometheus` - Metrics export

## Directory Structure

```
api-gateway/
├── README.md                          # This file
├── templates/                         # Gateway templates
│   └── routes.yaml                    # Gateway route template (single source of truth)
├── config/                            # Environment-specific values
│   ├── dev.env
│   ├── test.env
│   └── prod.env
├── scripts/                           # Automation scripts
│   └── generate-config.sh             # Script to generate configs from template
└── generated/                         # Generated configs (gitignored)
    ├── gw-routes-dev.yaml
    ├── gw-routes-test.yaml
    └── gw-routes-prod.yaml
```

## Manual Usage

### Generate Configuration

```bash
# Navigate to scripts directory
cd api-gateway/scripts

# Dedicated DEV deployment
./generate-config.sh dev

# PR-specific deployment (e.g., PR #6)
./generate-config.sh dev common-notify-6

# TEST deployment
./generate-config.sh test

# PROD deployment
./generate-config.sh prod
```

### Apply Configuration (Manual)

```bash
# Apply to API Gateway
gwa apply -i api-gateway/generated/gw-routes-dev.yaml
```

## Automated Deployment (via GitHub Actions)

Gateway configurations are automatically applied during deployments:

### PR Deployments (DEV)
- **Trigger:** PR opened/updated
- **Action:** Generates and applies PR-specific gateway config
- **Backend Host:** `common-notify-${PR_NUMBER}-backend.f6bc3f-dev.svc.cluster.local`
- **Cleanup:** Automatically deleted when PR is closed or merged

### Dedicated DEV Deployment
- **Trigger:** Merge to `main`
- **Action:** Applies dedicated DEV gateway config
- **Backend Host:** `common-notify-dev-backend.f6bc3f-dev.svc.cluster.local`

### TEST Deployment
- **Trigger:** Merge to `main` (after DEV deployment)
- **Action:** Applies TEST gateway config
- **Backend Host:** `common-notify-test-backend.f6bc3f-test.svc.cluster.local`

### PROD Deployment
- **Trigger:** Merge to `main` (after TEST deployment with approval)
- **Action:** Applies PROD gateway config
- **Backend Host:** `common-notify-prod-backend.f6bc3f-prod.svc.cluster.local`

## Configuration Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GATEWAY_ID` | Gateway identifier | `gw-fe8c5` |
| `GATEWAY_SERVICE_NAME` | Gateway service identifier | `gw-fe8c5-notify-dev` |
| `BACKEND_HOST` | Kubernetes backend service | `common-notify-6-backend.f6bc3f-dev.svc.cluster.local` |
| `ROUTE_PREFIX` | Route name prefix | `gw-fe8c5-dev-` |
| `GATEWAY_HOSTNAME` | External gateway hostname | `gw-fe8c5-notify.dev.api.gov.bc.ca` |
| `KEYCLOAK_ISSUER` | Keycloak issuer URL | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw` |
| `ALLOWED_AUDIENCE` | JWT audience claim | `ap-gw-fe8c5-default-dev-dev` |
| `RELEASE_NAME` | Helm release name (auto-set) | `common-notify-6` |

## Adding New Routes

1. Edit `api-gateway/templates/routes.yaml` to add the new route
2. Commit and push changes
3. GitHub Actions will automatically apply to all environments during deployment

Example:
```yaml
- name: ${ROUTE_PREFIX}my-new-route
  tags: [ns.${GATEWAY_ID}, env.${ENVIRONMENT}]
  hosts:
    - ${GATEWAY_HOSTNAME}
  paths:
    - /api/v1/my-new-endpoint
  methods:
    - POST
  strip_path: false
  # ... other route config
```

## Troubleshooting

### Verify Generated Config

```bash
cd api-gateway/scripts
./generate-config.sh dev common-notify-6
cat ../generated/gw-routes-dev.yaml
```

### Check GitHub Actions Logs

Navigate to the Actions tab in GitHub and view the workflow logs for gateway config deployment steps.

### Manual Cleanup

```bash
# Delete PR-specific gateway config
gwa destroy -i api-gateway/generated/gw-routes-dev.yaml
```

## References

- [BC Gov API Gateway Documentation](https://api.gov.bc.ca/docs)
- [GWA CLI Documentation](https://github.com/bcgov/gwa-cli)
