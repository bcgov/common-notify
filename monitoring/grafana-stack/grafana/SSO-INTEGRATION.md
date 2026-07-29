# Grafana SSO Integration with BC Gov IDIR

This guide walks through integrating Grafana with BC Government's Common Hosted Single Sign-On (CSS) service for IDIR authentication.

## Overview

- **SSO Service**: BC Gov Common Hosted SSO (CSS) - Keycloak-based
- **Authentication Method**: OpenID Connect (OIDC)
- **Identity Provider**: IDIR-MFA (BC Gov employees)
- **Grafana URL**: https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/

## Prerequisites

1. Access to BC Gov CSS Integration Portal
2. IDIR account with MFA enabled
3. OpenShift access to f6bc3f-tools namespace
4. Grafana deployed and accessible

## Step 1: Request CSS Integration

### 1.1 Access CSS Integration Portal

Navigate to: https://sso-requests.apps.gold.devops.gov.bc.ca/

Login with your IDIR + MFA credentials.

### 1.2 Create New Integration Request

Click **"Request Integration"** and fill out the form:

**Basic Information:**
- **Project Name**: Common Notify Grafana
- **Integration Type**: Standard (OIDC)
- **Protocol**: OIDC
- **Identity Providers**:
  - ✅ IDIR - MFA (required)

**Environments:**
Select which environments you need (start with Dev, add others later):
- ✅ Development
- ☐ Test
- ☐ Production

**Application Details:**
- **Application Type**: Browser-based application
- **Public Access**: No (internal BC Gov users only)

### 1.3 Configure Redirect URIs

**CRITICAL**: You must specify the exact redirect URIs for each environment.

**Development:**
```
https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/login/generic_oauth
```

**Test (if requested):**
```
https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/login/generic_oauth
```

**Production (if requested):**
```
https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/login/generic_oauth
```

### 1.4 Additional Configuration

**Post Logout Redirect URI (optional):**
```
https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/
```

**Valid Redirect URIs** should include:
```
https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/*
```

### 1.5 Submit Request

- Review all details
- Accept Terms of Use
- Submit request
- Wait for approval (typically within 1-2 business days)

## Step 2: Retrieve Client Credentials

### 2.1 After Approval

Once approved, return to the CSS portal and navigate to your integration.

### 2.2 Find Client Credentials

You'll see:
- **Client ID**: Something like `grafana-4461` or similar
- **Client Secret**: Click to reveal (looks like a long random string)
- **Installation JSON**: Download for reference

**IMPORTANT**: Copy both Client ID and Client Secret - you'll need them in the next step.

## Step 3: Create Kubernetes Secret

### 3.1 Encode Credentials

Base64 encode your credentials:

```bash
# Replace with your actual values from CSS portal
echo -n "your-client-id-here" | base64
echo -n "your-client-secret-here" | base64
```

### 3.2 Update Secret File

Edit `sso-secret.yaml` and replace the placeholder values:

```yaml
data:
  client_id: <your-base64-encoded-client-id>
  client_secret: <your-base64-encoded-client-secret>
```

### 3.3 Create Secret in OpenShift

```bash
oc apply -f monitoring/grafana-stack/grafana/sso-secret.yaml -n f6bc3f-tools
```

Verify:
```bash
oc get secret grafana-sso-credentials -n f6bc3f-tools
```

## Step 4: Update Grafana Configuration

### 4.1 Update Helm Values

The SSO configuration is in `values-tools-sso.yaml`. Key sections:

**Authentication Settings:**
```yaml
auth:
  disable_login_form: false  # Keep for emergency admin access
  oauth_allow_insecure_email_lookup: true
  oauth_auto_login: false  # Set true to skip login page
```

**OAuth Configuration:**
```yaml
auth.generic_oauth:
  enabled: true
  name: IDIR
  allow_sign_up: true
  # OAuth endpoints (adjust for TEST/PROD)
  auth_url: https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/auth
  token_url: https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/token
  api_url: https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/userinfo
  scopes: openid email profile
```

**Environment-Specific Endpoints:**

| Environment | Auth URL |
|-------------|----------|
| **Dev** | `https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect` |
| **Test** | `https://test.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect` |
| **Prod** | `https://loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect` |

### 4.2 Deploy Updated Configuration

Using GitHub Actions workflow (recommended):
```bash
git add monitoring/grafana-stack/grafana/values-tools-sso.yaml
git add monitoring/grafana-stack/grafana/sso-secret.yaml
git commit -m "feat: enable IDIR SSO for Grafana"
git push origin feat/grafana-sso-integration
```

Or manually with Helm:
```bash
cd monitoring/grafana-stack/grafana
helm upgrade grafana . \
  -f values-tools-sso.yaml \
  -n f6bc3f-tools
```

### 4.3 Wait for Rollout

```bash
oc rollout status deployment/grafana -n f6bc3f-tools
```

## Step 5: Test SSO Login

### 5.1 Access Grafana

Navigate to: https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/

### 5.2 Login Options

You should see:
- **"Sign in with IDIR"** button (OAuth)
- Username/password form (admin fallback)

### 5.3 Test IDIR Login

1. Click **"Sign in with IDIR"**
2. Redirect to BC Gov login page
3. Enter IDIR credentials
4. Complete MFA challenge
5. Redirect back to Grafana
6. User automatically created with Viewer role

### 5.4 Verify User Creation

As admin, check:
- Configuration → Users
- New user should appear with email from IDIR

## Step 6: User Management

### 6.1 Default Roles

- **New Users**: Automatically assigned "Viewer" role
- **Can View**: Dashboards, logs, alerts
- **Cannot**: Edit dashboards, change settings, manage users

### 6.2 Grant Admin Access

To promote a user to Admin:

1. Login as admin (username/password)
2. Navigate to: Configuration → Users
3. Find the IDIR user
4. Click user → Permissions tab
5. Change role to "Admin"

### 6.3 Role Mapping (Future Enhancement)

Currently, all users get Viewer role. To map roles from Keycloak groups:

1. Request role mapping in CSS integration
2. Update role_attribute_path in values-tools-sso.yaml:
```yaml
role_attribute_path: contains(groups[*], 'grafana-admin') && 'Admin' || 'Viewer'
```

## Troubleshooting

### Issue: "Invalid redirect_uri" error

**Cause**: Redirect URI mismatch between CSS and Grafana config

**Fix**:
1. Check CSS portal → Your Integration → Redirect URIs
2. Must exactly match: `https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca/login/generic_oauth`
3. Update in CSS portal if needed

### Issue: "Client authentication failed"

**Cause**: Wrong client_id or client_secret

**Fix**:
1. Verify credentials in CSS portal
2. Re-encode and update secret:
```bash
oc delete secret grafana-sso-credentials -n f6bc3f-tools
oc apply -f sso-secret.yaml -n f6bc3f-tools
oc rollout restart deployment/grafana -n f6bc3f-tools
```

### Issue: Users can't see dashboards

**Cause**: User role too restrictive

**Fix**:
1. Login as admin
2. Configuration → Users → [user] → Permissions
3. Verify role is at least "Viewer"

### Issue: SSO button doesn't appear

**Cause**: OAuth not enabled or misconfigured

**Fix**:
1. Check Grafana logs:
```bash
oc logs deployment/grafana -n f6bc3f-tools | grep -i oauth
```
2. Verify auth.generic_oauth.enabled: true in config
3. Restart Grafana

### Issue: "Error loading user info"

**Cause**: api_url (userinfo endpoint) incorrect

**Fix**:
1. Verify environment-specific URL in values-tools-sso.yaml
2. Should be: `https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/userinfo`

## Security Considerations

### Admin Fallback Access

- Keep admin username/password for emergency access
- Store in secure password manager
- Test periodically to ensure it works

### Secret Management

- Never commit actual client credentials to Git
- Use OpenShift secrets for sensitive data
- Rotate client_secret periodically (via CSS portal)

### User Provisioning

- Users auto-created on first login
- No pre-provisioning required
- Audit user list regularly

## Environment Migration

### Moving from Dev → Test → Prod

When ready to enable SSO in other environments:

1. **Update CSS Integration**:
   - Return to CSS portal
   - Add Test/Prod environments
   - Add corresponding redirect URIs

2. **Update Grafana Config**:
   - Change auth_url, token_url, api_url to test/prod endpoints
   - Deploy updated config

3. **Create Environment-Specific Secrets**:
   - Each environment gets different client_id/client_secret
   - Update sso-secret.yaml accordingly

## References

- **CSS Documentation**: https://bcgov.github.io/sso-docs/
- **CSS Portal**: https://sso-requests.apps.gold.devops.gov.bc.ca/
- **Grafana OAuth Docs**: https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/generic-oauth/
- **BC Gov SSO Endpoints**: https://bcgov.github.io/sso-docs/FAQs/keycloak

## Support

For CSS-related issues:
- Rocket.Chat: #sso channel
- Email: bcgov.sso@gov.bc.ca

For Grafana issues:
- Check Grafana logs in OpenShift
- Review this documentation
- Consult Grafana community docs
