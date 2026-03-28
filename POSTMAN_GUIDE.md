# Postman Collection Guide

## Overview

The Postman collection tests both **Admin APIs** and **Email APIs** with different authentication
approaches:

- **Admin APIs**: Direct backend access (no auth required for testing)
- **Email API (Direct)**: Direct backend access
- **Email API (Via Kong)**: Kong gateway access with API key authentication

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vite)                           │
│                      http://localhost:3000                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Caddy (Proxy)  │
                    │ Reverse Proxy   │
                    │ /api/* → Kong   │
                    └────────┬────────┘
                             │
        ┌────────────────────▼────────────────────┐
        │    Kong API Gateway                     │
        │    http://localhost:8000                │
        │                                          │
        │  - Validates apikey header              │
        │  - Rate limiting                        │
        │  - Routing to services                  │
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────▼────────────────────┐
        │    NestJS Backend                       │
        │    http://localhost:3001                │
        │                                          │
        │  - Admin endpoints (/admin/*)           │
        │  - Email endpoints (/email/*)           │
        │  - Health checks                        │
        └─────────────────────────────────────────┘
```

## Testing Workflow

### Prerequisites

1. **Backend running**: `docker-compose up --build backend database`
2. **Kong running**: `docker-compose up kong` (for gateway testing)
3. **Backend versioning**: All routes require `/api/v1/` prefix
4. **Database migration**: Flyway migrations must complete successfully

### Correct URL Format

**Direct Backend Access**:

```
POST {{backend_url}}/api/v1/admin/tenants          # Create tenant
GET  {{backend_url}}/api/v1/admin/tenants          # List tenants
POST {{backend_url}}/api/v1/email/send             # Send email
GET  {{backend_url}}/api/v1/email/status/:id       # Get status
```

**Via Kong Gateway**:

```
POST {{kong_url}}/api/v1/email/send                # With apikey header
GET  {{kong_url}}/api/v1/email/status/:id          # With apikey header
```

### Common Issues & Solutions

**Issue: 404 Cannot POST /admin/tenants**

- **Cause**: Missing `/api/v1/` versioning prefix
- **Solution**: Use `POST {{backend_url}}/api/v1/admin/tenants` (not `/api/admin/`)
- **Note**: Backend app.ts has URL prefix configuration enabled

**Issue: 401 Unauthorized (Kong)**

- **Cause**: Missing or invalid apikey header
- **Solution**:
  1. Create tenant first to get apiKey from response
  2. Set Postman environment variable `tenant_api_key` with the returned key
  3. Ensure request includes header: `apikey: {{tenant_api_key}}`

**Issue: PostgreSQL Column Does Not Exist**

- **Cause**: TypeORM entity camelCase not mapped to database snake_case columns
- **Solution**: Ensure tenant.entity.ts has `@Column({ name: 'snake_case' })` decorators
- **Status**: Fixed in recent commit - rebuild required

### Step 1: Create a Tenant (Admin API)

1. Open Postman collection
2. Go to **Admin APIs** → **1. Create Tenant**
3. Click **Send** (URL: `POST http://localhost:3001/api/v1/admin/tenants`)
4. Copy the `apiKey` from the JSON response

Example response:

```json
{
  "tenant": {
    "id": 1,
    "name": "bchealth-notifications",
    "status": "active"
  },
  "apiKey": "secret-api-key-12345",
  "note": "Store this key securely..."
}
```

### Step 2: Set Environment Variable

1. In Postman, click the **Environment** dropdown (top right)
2. Select **Manage Environments** or click the eye icon
3. Find `tenant_api_key` variable
4. Paste your API key as the value
5. Save

### Step 3: Test Direct Email API

1. Go to **Email API (Direct Backend)** → **1. Send Email (Direct)**
2. Click **Send**
3. Save the email ID from response (e.g., `email_1234567890_abc123def456`)
4. Go to **2. Get Email Status**, replace the ID, and test

### Step 4: Test Kong-Authenticated Email API

1. Go to **Email API (Via Kong)** → **1. Send Email (Via Kong with API Key)**
2. The request header already has `apikey: {{tenant_api_key}}`
3. Click **Send**
4. You should get the same response as direct API, but this time Kong validated the key
5. Test status endpoint similarly

## Key Differences

| Endpoint                 | Authentication | Use Case                |
| ------------------------ | -------------- | ----------------------- |
| `/email/send` (direct)   | None           | Backend testing         |
| `/api/email/send` (Kong) | API key header | Frontend/tenant testing |

## Environment Variables

| Variable         | Default                 | Description                  |
| ---------------- | ----------------------- | ---------------------------- |
| `backend_url`    | `http://localhost:3001` | Direct backend (no auth)     |
| `kong_url`       | `http://localhost:8000` | Kong gateway (requires auth) |
| `tenant_api_key` | (empty)                 | Set after creating tenant    |

## Future Testing Scenarios

Once Kong is configured:

### Frontend (Vite) Testing

```javascript
// In browser console or e2e tests
fetch('/api/v1/email/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: 'your-tenant-api-key', // Set by Kong from credentials
  },
  body: JSON.stringify({
    to: 'user@example.com',
    subject: 'Test',
    body: 'Hello',
  }),
})
```

Caddy will proxy this to Kong:

```
Frontend: POST /api/v1/email/send
    ↓
Caddy: Proxies to Kong
    ↓
Kong: http://localhost:8000/api/v1/email/send
    ↓
Backend: http://localhost:3001/api/v1/email/send
```

## Importing Collection

1. Download `postman-collection.json` from the root directory
2. In Postman: **File** → **Import** → Select the JSON file
3. The collection appears in your sidebar
4. Environment variables are pre-configured; just set `tenant_api_key`

## Troubleshooting

### 404 Error - "Cannot POST /admin/tenants"

Make sure you're using the `/api/v1/` prefix in URLs. The backend has API versioning enabled.

**Correct URLs:**

- `POST http://localhost:3001/api/v1/admin/tenants` ✅
- `GET http://localhost:3001/api/v1/email/send` ✅

**Wrong URLs:**

- `http://localhost:3001/admin/tenants` ❌
- `http://localhost:3001/email/send` ❌

The Postman collection has been updated with correct `/api/v1/` prefixes. If you imported an older
version, please re-import `postman-collection.json`.

### "Connection refused" on Kong URL

- Kong might not be running
- Check `docker-compose.yml` - Kong service status
- Try direct backend URL instead for testing

### API key validation fails

- Make sure you set the `tenant_api_key` environment variable
- Verify it matches the key returned from "Create Tenant"
- Check Kong logs for validation errors

### CORS issues (when testing from browser)

- Caddy/Kong should handle CORS
- Check Caddyfile and kong-seed.sh configuration

## Next Steps

1. Test all endpoints locally with this collection
2. Verify Kong routing is working
3. Deploy to dev environment and update URLs
4. Create similar endpoints for SMS, Push notifications
