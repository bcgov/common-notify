# Tenants & API Key Management - Admin API

This guide demonstrates how to use the new Admin API to create tenants and manage API keys.

## Endpoints

### Create Tenant

```bash
POST /api/v1/admin/tenants
Content-Type: application/json

{
  "name": "bchealth-notifications",
  "description": "BC Health Notifications Service",
  "organization": "BC Ministry of Health",
  "contactEmail": "admin@bchealth.ca",
  "contactName": "John Doe"
}
```

**Response:**

```json
{
  "tenant": {
    "id": 1,
    "name": "bchealth-notifications",
    "description": "BC Health Notifications Service",
    "organization": "BC Ministry of Health",
    "contactEmail": "admin@bchealth.ca",
    "contactName": "John Doe",
    "kongConsumerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "kongUsername": "bchealth-notifications",
    "status": "active",
    "createdAt": "2026-03-27T20:00:00.000Z",
    "updatedAt": "2026-03-27T20:00:00.000Z"
  },
  "apiKey": "test-api-key-xyz-12345678901234567890",
  "note": "Store this key securely. It cannot be retrieved later. Use it in the `apikey` header when calling the API."
}
```

**Important:** Save the `apiKey` value immediately. It is shown only once and cannot be recovered.

### List Tenants

```bash
GET /api/v1/admin/tenants
```

### Get Single Tenant

```bash
GET /api/v1/admin/tenants/{tenantId}
```

### Generate New API Key

```bash
POST /api/v1/admin/tenants/{tenantId}/keys
```

**Response:**

```json
{
  "apiKey": "another-api-key-xyz-1234567890123456",
  "note": "Store this key securely. It cannot be retrieved later."
}
```

### List API Keys for Tenant

```bash
GET /api/v1/admin/tenants/{tenantId}/keys
```

**Response:**

```json
[
  {
    "id": "key-id-1",
    "createdAt": "2026-03-27T20:00:00.000Z"
  },
  {
    "id": "key-id-2",
    "createdAt": "2026-03-27T20:01:00.000Z"
  }
]
```

### Revoke API Key

```bash
DELETE /api/v1/admin/tenants/{tenantId}/keys/{keyId}
```

### Delete Tenant

```bash
DELETE /api/v1/admin/tenants/{tenantId}
```

This also revokes all API keys for the tenant.

---

## Testing the Flow

### 1. Create a Tenant

```bash
curl -X POST http://localhost:3001/api/v1/admin/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-tenant-dev",
    "description": "Test Tenant for Development",
    "organization": "Test Org",
    "contactEmail": "test@example.com",
    "contactName": "Test User"
  }'
```

Save the returned `apiKey` value.

### 2. Use the Key to Call the API

```bash
curl -H "apikey: <your-api-key>" http://localhost:8000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    }
  }
}
```

### 3. Generate Additional Keys

```bash
curl -X POST http://localhost:3001/api/v1/admin/tenants/1/keys
```

### 4. List Keys

```bash
curl http://localhost:3001/api/v1/admin/tenants/1/keys
```

### 5. Revoke a Key

```bash
curl -X DELETE http://localhost:3001/api/v1/admin/tenants/1/keys/{keyId}
```

---

## Architecture Notes

- **Tenant Creation**: When you create a tenant, the system:
  1. Creates a consumer in Kong (via Kong Admin API)
  2. Generates an API key in Kong
  3. Stores tenant metadata in PostgreSQL (but NOT the actual keys)

- **API Keys**: Keys are stored in Kong, not in our database. Our database only stores references.

- **Security**: API keys are shown only once. If lost, generate a new key and revoke the old one.

- **Multi-Tenant**: Each tenant has its own Kong consumer ID and can have multiple API keys.

---

## Next Steps

1. Add authentication to the admin endpoints (e.g., bearer token or OIDC)
2. Implement tenant isolation - ensure tenants can only access their own resources
3. Add audit logging for key generation and revocation
4. Set up rate limiting per tenant
5. Add WebSocket support for real-time notifications
