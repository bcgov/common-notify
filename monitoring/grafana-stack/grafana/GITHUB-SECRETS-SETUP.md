# Setting Up GitHub Secrets for Grafana SSO

This guide shows you how to add the SSO credentials from CSS to GitHub Secrets so they can be securely used during deployment.

## Why GitHub Secrets?

✅ **Security**: Credentials never stored in Git repository
✅ **Automatic**: GitHub Actions automatically injects them during deployment
✅ **Safe**: Secrets are encrypted and only accessible during workflow runs

## Your CSS Credentials

From your CSS integration approval, you received:

```json
{
  "resource": "notify-6519",
  "credentials": {
    "secret": "xxxxxxxxxx"
  }
}
```

**Client ID**: `notify-6519`
**Client Secret**: `xxxxxxxxxx` (your actual secret)

## Step 1: Navigate to GitHub Repository Settings

1. Go to your GitHub repository: https://github.com/bcgov/nr-notify
2. Click **Settings** (top navigation bar)
3. In the left sidebar, expand **Secrets and variables**
4. Click **Actions**

## Step 2: Add GRAFANA_SSO_CLIENT_ID Secret

1. Click **New repository secret** button
2. Fill in the form:
   - **Name**: `GRAFANA_SSO_CLIENT_ID`
   - **Secret**: `notify-6519`
3. Click **Add secret**

## Step 3: Add GRAFANA_SSO_CLIENT_SECRET Secret

1. Click **New repository secret** button again
2. Fill in the form:
   - **Name**: `GRAFANA_SSO_CLIENT_SECRET`
   - **Secret**: `xxxxxxxxxx` (paste your actual client secret from CSS)
3. Click **Add secret**

## Step 4: Verify Secrets Are Added

You should now see both secrets listed:

- ✅ `GRAFANA_SSO_CLIENT_ID` - Updated X seconds ago
- ✅ `GRAFANA_SSO_CLIENT_SECRET` - Updated X seconds ago

**Note**: You cannot view the secret values after adding them (this is a security feature). You can only update or delete them.

## How It Works

### During Deployment

When the GitHub Actions workflow runs:

1. **Workflow starts** (`deploy-monitoring.yml`)
2. **Secrets are accessed**: `${{ secrets.GRAFANA_SSO_CLIENT_ID }}` and `${{ secrets.GRAFANA_SSO_CLIENT_SECRET }}`
3. **Base64 encoded**: Converted to base64 for Kubernetes
4. **Secret created**: Applied to OpenShift namespace
5. **Grafana deployed**: Mounts the secret and uses it for OAuth

### In the Code

**GitHub Actions Workflow** (`.github/workflows/deploy-monitoring.yml`):
```yaml
# Create/Update Grafana SSO secret from GitHub Secrets
echo "🔐 Creating/Updating Grafana SSO credentials..."
SSO_CLIENT_ID_B64=$(echo -n "${{ secrets.GRAFANA_SSO_CLIENT_ID }}" | base64 -w 0)
SSO_CLIENT_SECRET_B64=$(echo -n "${{ secrets.GRAFANA_SSO_CLIENT_SECRET }}" | base64 -w 0)

# Create Kubernetes secret with actual values
oc apply -f /tmp/sso-secret.yaml
```

**Grafana Helm Values** (`values-tools-sso.yaml`):
```yaml
# Mount SSO credentials secret
extraSecretMounts:
  - name: auth-generic-oauth-secret-mount
    secretName: grafana-sso-credentials
    mountPath: /etc/secrets/auth_generic_oauth
    readOnly: true

# Reference in OAuth config
auth.generic_oauth:
  client_id: $__file{/etc/secrets/auth_generic_oauth/client_id}
  client_secret: $__file{/etc/secrets/auth_generic_oauth/client_secret}
```

## Testing the Setup

After adding the secrets, you can test by:

1. **Commit and push** your SSO configuration:
   ```bash
   git add .
   git commit -m "feat: configure Grafana SSO with IDIR authentication"
   git push origin feat/grafana-sso-integration
   ```

2. **Create a Pull Request** to main branch

3. **Manually trigger** the workflow:
   - Go to Actions tab
   - Select "Deploy Monitoring Stack"
   - Click "Run workflow"
   - Select:
     - Deployment mode: `centralized`
     - Component: `grafana`
   - Click "Run workflow"

4. **Watch the deployment logs**:
   - You should see: `🔐 Creating/Updating Grafana SSO credentials...`
   - Followed by: `✅ SSO credentials configured`

5. **Test SSO login**:
   - Navigate to Grafana URL
   - Click "Sign in with IDIR"
   - Complete IDIR authentication
   - You should be logged in!

## Troubleshooting

### Error: "Secret not found"

**Cause**: GitHub Secret not added or has wrong name

**Fix**:
1. Verify secret names are exactly:
   - `GRAFANA_SSO_CLIENT_ID`
   - `GRAFANA_SSO_CLIENT_SECRET`
2. Check they're in the correct repository
3. Make sure they're under "Actions" secrets (not "Dependabot" or "Codespaces")

### Error: "Invalid client credentials"

**Cause**: Wrong client_id or client_secret value

**Fix**:
1. Go back to CSS portal: https://sso-requests.apps.gold.devops.gov.bc.ca/
2. Navigate to your integration (Request ID: 00006518)
3. Verify the client_id and client_secret
4. Update the GitHub Secrets with correct values:
   - Repository Settings → Secrets and variables → Actions
   - Click the secret name → "Update secret"
   - Enter new value → "Update secret"

### Secret values are visible in logs

**Cause**: Accidentally echoing secret values

**Fix**: The workflow is designed to NOT print secrets. If you see secrets in logs:
1. Check if any debugging `echo` commands were added
2. GitHub automatically masks registered secrets in logs
3. Report to security team if actual secrets are visible

## Security Best Practices

✅ **Never commit secrets to Git**: Always use GitHub Secrets
✅ **Rotate regularly**: Update client_secret periodically via CSS portal
✅ **Limit access**: Only repository admins can view/edit secrets
✅ **Audit**: Check "Updated X ago" to monitor changes
✅ **Environment separation**: Use different secrets for Dev/Test/Prod

## Updating Secrets

To update a secret (e.g., after rotating credentials):

1. Go to Repository Settings → Secrets and variables → Actions
2. Find the secret (e.g., `GRAFANA_SSO_CLIENT_SECRET`)
3. Click the secret name
4. Click **Update secret**
5. Enter new value
6. Click **Update secret**
7. Re-run the deployment workflow

The next deployment will automatically use the new values!

## Next Steps

✅ GitHub Secrets configured
✅ Workflow updated to inject secrets
✅ Ready to deploy Grafana with SSO

**Next**: Merge your PR and deploy to enable IDIR authentication!
