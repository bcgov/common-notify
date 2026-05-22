# API Gateway Configuration - Progressive Deployment

## Overview

This project uses a **progressive deployment** approach for API Gateway configurations to prevent mistakes from reaching production environments.

## How It Works

### The Core Principle

Since the `gwa apply` tool syncs gateway state with config files (deleting anything not in the file), we use **environment-specific config generation** that progressively adds environments as they're approved.

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     PR Created                              │
│  ✓ Gateway: DEV + TEST + PROD + PR (all environments)      │
│  ✓ Deploy: PR environment only                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  PR Merged to Main                          │
│  ⚠️  Gateway: DEV only (TEST/PROD routes removed)           │
│  ✓ Deploy: DEV only                                         │
│                                                             │
│  Impact: TEST and PROD gateway routes temporarily removed   │
│  This is intentional - mistakes are caught in DEV first!    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│            TEST Environment Approved (Manual)                │
│  ✓ Gateway: DEV + TEST (TEST routes restored)               │
│  ✓ Deploy: TEST environment                                 │
│  ⚠️  PROD routes still removed                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│            PROD Environment Approved (Manual)                │
│  ✓ Gateway: DEV + TEST + PROD (all routes restored)         │
│  ✓ Deploy: PROD environment                                 │
└─────────────────────────────────────────────────────────────┘
```

## Why This Approach?

### Problem Scenario
```
Developer makes mistake → Deletes all routes in config
Without progressive deployment:
  ❌ Mistake applied to DEV, TEST, PROD simultaneously
  ❌ Production is down immediately
```

### With Progressive Deployment
```
Developer makes mistake → Deletes all routes in config
With progressive deployment:
  1. ✓ Mistake applied to DEV only
  2. ✓ Caught during DEV testing
  3. ✓ Fixed before TEST approval
  4. ✓ PROD never affected
```

## Scripts

### `generate-gateway-for-stage.sh`

Progressive config generator that creates environment-specific gateway configs.

**Usage:**
```bash
# Apply to DEV only (removes TEST/PROD)
./api-gateway/scripts/generate-gateway-for-stage.sh dev

# Apply to DEV + TEST (removes PROD)
./api-gateway/scripts/generate-gateway-for-stage.sh test

# Apply to DEV + TEST + PROD (all environments)
./api-gateway/scripts/generate-gateway-for-stage.sh prod

# Apply to DEV + TEST + PROD + PR
./api-gateway/scripts/generate-gateway-for-stage.sh pr <pr-number>
```

**Output:** `api-gateway/generated/gw-active-services.yaml`

### `generate-gateway-config.sh` (Legacy)

Original script that generates individual environment configs. Still used internally by `generate-gateway-for-stage.sh`.

## Workflows

### merge.yml (Main Deployment Pipeline)

**On merge to main:**
1. ✅ Build and import images
2. ⚠️  **Apply DEV gateway config only** (TEST/PROD removed)
3. ✅ Deploy to DEV

**On TEST approval:**
1. ✅ **Apply DEV+TEST gateway config** (TEST restored, PROD removed)
2. ✅ Deploy to TEST

**On PROD approval:**
1. ✅ Tag images for PROD
2. ✅ **Apply DEV+TEST+PROD gateway config** (all restored)
3. ✅ Deploy to PROD

### pr-open.yml (PR Deployment)

**On PR opened/updated:**
1. ✅ Build and import PR images
2. ✅ **Apply DEV+TEST+PROD+PR gateway config** (adds PR without removing existing)
3. ✅ Deploy PR environment

*Note: PR deployments preserve existing environments to avoid disrupting ongoing deployments.*

### pr-close.yml (PR Cleanup)

**On PR closed:**
1. ✅ Cleanup Helm releases
2. ✅ Remove database user
3. ✅ **Apply DEV+TEST+PROD gateway config** (removes PR, restores permanent envs)

### restore-gateway.yml (Emergency Recovery)

**Manual trigger only:**
- Restores all three permanent environments (DEV+TEST+PROD)
- Use this if gateway state becomes inconsistent

## Important Notes

### Temporary Route Removal is Expected

When a change is merged to main:
- ⚠️  **TEST and PROD routes will be temporarily removed**
- ✓ This is **intentional behavior**
- ✓ Routes are restored when those environments are approved
- ✓ The application deployments are also gated, so there's no impact

### Environment Protection Rules

Configure GitHub environment protection rules for:
- **TEST environment:** Require manual approval
- **PROD environment:** Require manual approval

**Settings → Environments → [Environment] → Required reviewers**

### What Happens During the Gap?

**Q:** What happens to TEST/PROD when their routes are removed?

**A:** The API Gateway returns `503 Service Unavailable` for those routes until they're restored. However:
- The applications themselves aren't redeployed yet (gated by environment approval)
- The old application versions keep running
- Once approved, both gateway routes AND applications are updated together

## Troubleshooting

### All Environments Deleted

If all environments were accidentally deleted:

```bash
# Option 1: Run emergency restore workflow
# Go to Actions → restore-gateway.yml → Run workflow → Type "restore"

# Option 2: Manual restoration
cd /path/to/nr-notify
export GWA_ACCT='{"client_id":"...","client_secret":"..."}'
gwa login --client-id "$(echo "$GWA_ACCT" | jq -r '.client_id')" \
  --client-secret "$(echo "$GWA_ACCT" | jq -r '.client_secret')"
gwa config set gateway gw-fe8c5
api-gateway/scripts/generate-gateway-for-stage.sh prod
gwa apply -i api-gateway/generated/gw-active-services.yaml
```

### Wrong Stage Applied

If the wrong stage was applied (e.g., DEV applied when it should be DEV+TEST+PROD):

```bash
# Generate the correct stage
./api-gateway/scripts/generate-gateway-for-stage.sh prod

# Apply it
gwa apply -i api-gateway/generated/gw-active-services.yaml
```

## Migration from Old Approach

**Old behavior:**
- All environments always synced together
- Changes applied to DEV, TEST, PROD simultaneously
- Risk of mistakes affecting production immediately

**New behavior:**
- Environments progressively activated
- Changes tested in lower environments first
- Production isolated from development mistakes

## FAQ

**Q: Why not use Kong's `deck` CLI with `--select-tag`?**

A: The BC Gov API Gateway uses custom authentication via `gwa` CLI. Kong's `deck` tool would require direct access to the Kong Admin API, which is not exposed.

**Q: Can we have different config versions in different environments?**

A: No. The `gwa apply` tool is state-based, not version-based. It syncs the gateway to match the provided config. This is why we use progressive activation (removing/restoring routes) rather than versioning.

**Q: What if I need to rollback?**

A: Rollback the code in your environment (via Helm/OpenShift), then re-run the appropriate gateway config stage. Gateway configs follow the code deployments.

**Q: Can I test gateway changes locally?**

A: Gateway changes can only be tested in the actual BC Gov API Gateway (dev environment). There's no local Kong instance that mirrors production gateway behavior.
