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
| `GATEWAY_SERVICE_NAME` | Gateway service identifier | `gw-cnotify-notify-dev` |
| `BACKEND_HOST` | Kubernetes backend service | `common-notify-6-backend.f6bc3f-dev.svc.cluster.local` |
| `ROUTE_PREFIX` | Route name prefix | `gw-cnotify-dev-` |
| `GATEWAY_HOSTNAME` | External gateway hostname | `gw-cnotify-notify.dev.api.gov.bc.ca` |
| `KEYCLOAK_ISSUER` | Keycloak issuer URL | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw` |
| `ALLOWED_AUDIENCE` | JWT audience claim | `ap-gw-cnotify-default-dev-dev` |
| `RELEASE_NAME` | Helm release name (auto-set) | `common-notify-6` |

## Adding New Routes

1. Edit `api-gateway/templates/routes.yaml` to add the new route
2. Commit and push changes
3. GitHub Actions will automatically apply to all environments during deployment

Example:
```yaml
- name: ${ROUTE_PREFIX}my-new-route
  tags: [ns.gw-cnotify]
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
