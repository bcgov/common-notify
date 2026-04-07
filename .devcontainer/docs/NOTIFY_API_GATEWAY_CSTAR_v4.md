# Notify API – Gateway & Tenant Management (via CSTAR) v4

## 1. Overview

We are building a Notify service that allows tenants to send emails/sms/messages/etc. via an API. We
are also building an admin component that allows users to create templates for their messages, as
well as other admin tasks.

Tenant and API credential management is delegated to **CSTAR (Connected Services, Team Access &
Roles)**, a BC Gov platform service that specializes in multi-tenant workspace management. Notify
integrates with CSTAR to:

- Create and manage tenant workspaces
- Assign users and roles to tenants
- Generate and issue API credentials (keys and OAuth2 client credentials)

Authentication is enforced by the API Gateway. The API Gateway validates three authentication
methods:

1. **JWT** (for user/admin UI access)
2. **API Keys** (for service-to-service, simple static keys)
3. **OAuth2 Client Credentials** (for service-to-service, token-based)

The API Gateway will only relay requests back to Notify if they're valid. No JWT or API key
validation needs to happen a second time on the backend.

We don't store keys. That said, we likely want to store the following, which is injected by the API
Gateway:

- `X-Consumer-Username: test-tenant-a`
- `X-Consumer-ID: <tenant-uuid>`
- `X-Credential-ID: <key-id>`

These three pieces of information (injected by the API Gateway) allow us to identify:

- **Tenant**: The workspace that initiated the request
- **User**: The authenticated user or service making the request
- **Credential**: Which API credential was used (API Key ID or OAuth2 client credential)

### Simple Flow

Quick and dirty version: we'll want to route everything through the API gateway. The API Gateway
validates JWTs and OAuth2 tokens (using the jwt plugin and oauth2 plugin). The API Gateway proxies
requests to Notify and injects tenant headers. Notify then validates tenant information by calling
CSTAR. We create a network policy in OpenShift that only accepts traffic to the backend from the API
Gateway. In this way, we know that any requests to the backend come through validated
authentication.

### 1. User/Admin Flow (JWT Authentication)

```mermaid
flowchart LR
    User -->|Browser| Frontend[Frontend UI<br/>Caddy/Vite]
    CSS["CSS SSO<br/>(Keycloak)"]

    User -->|Login| CSS
    CSS -->|JWT Token| User
    Frontend -->|Admin Request + JWT| Gateway[API Gateway]
    Gateway -->|Validate JWT<br/>Inject Headers| AdminAPI[Notify Admin API]
    AdminAPI -->|Process Admin Request| AdminAPI

    style Gateway fill:#ff9800
    style Frontend fill:#4CAF50
    style AdminAPI fill:#4CAF50
    style CSS fill:#9C27B0
```

### 2. Client Credentials Flow (OAuth2 Service Integration)

```mermaid
flowchart LR
    Service["External Service<br/>(Application)"]
    Keycloak["Keycloak<br/>(Token Endpoint)"]

    Service -->|client_id + client_secret| Keycloak
    Keycloak -->|JWT Token<br/>expires_in: 3600| Service
    Service -->|POST /api/v1/notifications/send<br/>Authorization: Bearer token| Gateway[API Gateway]
    Gateway -->|Validate Token<br/>Inject Headers| NotifyAPI[Notify Notification API]
    NotifyAPI -->|Send Email/SMS| Email["CHES/Twilio<br/>Providers"]

    style Gateway fill:#ff9800
    style Service fill:#ff6b6b
    style NotifyAPI fill:#4CAF50
    style Email fill:#2196F3
    style Keycloak fill:#9C27B0
```

### 3. Tenant Lookup Flow

```mermaid
flowchart TD
    A["User calls Notify<br/>with JWT"] -->|Extract user ID| B["Get idir_user_guid"]
    B -->|Call CSTAR| C["GET /v1/users/tenants"]
    C -->|Validate & lookup| D["CSTAR returns<br/>user's tenants"]
    D -->|Single tenant?| E{Count}
    E -->|Yes| F["Use that tenant"]
    E -->|No| G["Ask user to select"]
    G -->|User picks| F
    F -->|Process request| H["Execute with<br/>tenant context"]

    style A fill:#ff6b6b
    style B fill:#4CAF50
    style C fill:#ff9800
    style D fill:#ff9800
    style E fill:#f3e5f5
    style H fill:#4CAF50
```

### 3. Tenant Creation Flow (CSTAR)

```mermaid
flowchart TD
    A["External App<br/>(Notify)"] -->|1. Authenticate user| B["Keycloak<br/>(Get JWT)"]
    B -->|2. JWT Token| A
    A -->|3. POST /v1/tenants<br/>with JWT| C["CSTAR API"]
    C -->|4. Validate JWT<br/>Check if Operations Admin| D{User is<br/>Admin?}
    D -->|No| E["401 Unauthorized"]
    D -->|Yes| F["Create Tenant<br/>in PostgreSQL"]
    F -->|6. Tenant created| G["Return Tenant ID<br/>& Info"]
    G -->|7. Tenant Object| A
    E -->|Error| A

    style A fill:#ff6b6b
    style B fill:#9C27B0
    style C fill:#ff9800
    style D fill:#f3e5f5
    style E fill:#ff6b6b
    style F fill:#4CAF50
    style G fill:#4CAF50
```

### Key Points

- **Two authentication paths**: JWT (Admin Users via API Gateway) and OAuth2 Client Credentials
  (Service Integrations via API Gateway)
- **Frontend** (Caddy/Vite) is the entry point for user/admin interactions
- **API Gateway** is the single entry point for all API requests (enforces authentication, injects
  tenant headers)
- **Notify API** receives requests from API Gateway with tenant context and validates tenant info
  with CSTAR
- **CSTAR** manages tenant workspaces, user/role information, and shared service access
- **Notify** does NOT manage credentials directly; that's delegated to CSTAR
- Backend services are not publicly accessible (only accessible via API Gateway)

---

## 2. Architecture Review (Detailed View)

### System Components

| Component        | Responsibility                                               |
| ---------------- | ------------------------------------------------------------ |
| API Gateway      | Auth (JWT + OAuth2), routing, tenant header injection.       |
| JWT Plugin       | Validates JWT signatures and claims                          |
| OAuth2 Plugin    | Validates OAuth2 tokens with Keycloak                        |
| **CSTAR**        | **Tenant workspaces, user/role management, shared services** |
| Frontend UI      | Admin interface (authenticates via JWT)                      |
| Notify Admin API | Notify-specific features (templates, message history)        |
| Notify API       | Core messaging functionality                                 |
| CSS / Keycloak   | OAuth / SSO (issues JWT tokens)                              |

---

## Detailed Flow

### User/Frontend Flow (JWT Authentication)

```mermaid
sequenceDiagram
    participant User as "User (Browser)"
    participant CSS as "CSS SSO"
    participant Frontend as "Frontend<br/>(Caddy/Vite)"
    participant Gateway as "API Gateway"
    participant AdminAPI as "Notify Admin API"

    User->>CSS: Login request
    CSS-->>User: JWT Token (signed with secret)

    User->>Frontend: Admin Request (with JWT)
    Frontend->>Gateway: Proxy request with JWT<br/>Authorization: Bearer token
    Gateway->>Gateway: Validate JWT signature
    Gateway->>Gateway: Check token expiry & claims
    Gateway->>AdminAPI: Forward request + inject headers
    AdminAPI-->>Gateway: Response
    Gateway-->>Frontend: Response
    Frontend-->>User: Response
```

### Service/OAuth2 Flow (Client Credentials Authentication)

```mermaid
sequenceDiagram
    participant Service
    participant Keycloak as "Keycloak<br/>(Token Endpoint)"
    participant Gateway as "API Gateway"
    participant API as "Notify Email API"

    Service->>Keycloak: POST /token<br/>grant_type: client_credentials<br/>client_id: [id]<br/>client_secret: [secret]
    Keycloak->>Keycloak: Generate JWT<br/>Set expiry (1 hour)
    Keycloak-->>Service: {access_token: jwt, expires_in: 3600}

    Service->>Gateway: POST /api/v1/notifications/send<br/>Authorization: Bearer [jwt]
    Gateway->>Gateway: Validate JWT signature<br/>Check token expiry
    Gateway->>Gateway: Inject X-Tenant-ID header
    Gateway->>API: Forward request + tenant header
    API-->>Gateway: Response
    Gateway-->>Service: Response
```

### Tenant Validation Flow (Notify calls CSTAR)

After Notify receives a request from the API Gateway with tenant context, it validates the tenant
information by calling CSTAR:

```mermaid
sequenceDiagram
    participant TenantService as "Tenant Service"
    participant Gateway as "API Gateway"
    participant NotifyAPI as "Notify API"
    participant ServiceAccount as "Keycloak<br/>(Service Account)"
    participant CSTAR as "CSTAR API"

    TenantService->>Gateway: Request with auth (JWT or OAuth2)
    Gateway->>NotifyAPI: Forward request<br/>+ X-Tenant-ID header

    Note over NotifyAPI: Step 1: Get Service Account Token
    NotifyAPI->>ServiceAccount: POST /token<br/>grant_type: client_credentials
    ServiceAccount-->>NotifyAPI: {access_token: jwt}

    Note over NotifyAPI: Step 2: Validate Tenant Info
    NotifyAPI->>CSTAR: GET /v1/tenants/[tenantId]<br/>Authorization: Bearer [service token]
    CSTAR-->>NotifyAPI: {id, name, status, ...}

    Note over NotifyAPI: Step 3: Get Tenant Metadata (optional)
    NotifyAPI->>CSTAR: GET /v1/tenants/[tenantId]/users
    CSTAR-->>NotifyAPI: [user list]

    NotifyAPI-->>Gateway: Response
    Gateway-->>TenantService: Response
```

---

## API Gateway Authentication Plugins

API Gateway uses **two authentication plugins** to handle authentication flows:

### 1. JWT Plugin (for User/Frontend Auth)

The **JWT plugin** validates JSON Web Tokens issued by your OAuth provider (CSS SSO).

**How it works:**

1. User logs in via CSS → receives signed JWT
2. Frontend includes JWT in `Authorization: Bearer <token>` header
3. API Gateway JWT plugin validates:
   - JWT signature (using configured secret)
   - Token expiration (`exp` claim)
   - Issuer claim (`iss`) matches a registered tenant/workspace
4. API Gateway injects headers and forwards to backend

### 2. OAuth2 Plugin (for Service/Enterprise Auth)

The **OAuth2 plugin** implements the client credentials grant flow for token-based authentication.

**How it works:**

1. Service exchanges credentials for a JWT access token:

   ```bash
   curl -X POST https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials" \
     -d "client_id=tenant-client-id" \
     -d "client_secret=tenant-client-secret" \
     -d "scope=notify"
   ```

2. Service receives OAuth2 token response:

   ```json
   {
     "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "scope": "notify"
   }
   ```

3. Service includes token in Authorization header for API calls:

   ```bash
   curl -X POST https://coco-notify-gateway.dev.api.gov.bc.ca/api/v1/notifications/send \
     -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
     -H "Content-Type: application/json" \
     -d '{"type": "email", "recipient": "user@example.com", ...}'
   ```

4. API Gateway validates token signature and expiry
5. API Gateway injects headers and forwards to backend

**Pros**: Token-based (more secure), tokens expire automatically, aligns with OAuth2 industry
standard **Cons**: Requires extra step to exchange credentials for token

---

## API Gateway Plugin Setup & Configuration

API Gateway requires two authentication plugins to be installed and configured on routes. This is
setup via the files in .api-gateway (need to integrate this into the pipeline so that dev/test/prod
use the correct gateways).

### Plugin Installation

- `jwt` - JSON Web Token authentication (for UI/admin users)
- `oauth2` - OAuth2 client credentials flow (for service integrations)

This is done, I think, but need to test it. The service is named `coco-notify-backend-dev` in
https://api.gov.bc.ca/manager/services

### Route-Specific Plugin Configuration

Work in progress. Need to document the gateway configuration file here that I created. I'll document
once I verify that the gateway services work correctly.

## Authentication Methods Summary

### 1. JWT Method (User/Frontend/Admin)

| Property         | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| **Use case**     | Users login to administer templates, manage tenants, view reports |
| **Token source** | CSS SSO (Keycloak Standard realm)                                 |
| **Validation**   | API Gateway                                                       |
| **Storage**      | Stored client-side (localStorage/sessionStorage)                  |
| **Path**         | `/api/v1/admin/*`                                                 |
| **Header**       | `Authorization: Bearer <jwt>`                                     |
| **Duration**     | Typically 15-60 minutes (SSO managed)                             |

### 2. OAuth2 Client Credentials (Service/Token-Based)

| Property           | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Use case**       | Services securely exchange credentials for temporary tokens                |
| **Credentials**    | Client ID + Client Secret (generated via CSTAR)                            |
| **Token exchange** | POST to Keycloak `/protocol/openid-connect/token`                          |
| **Validation**     | API Gateway validates JWT signature and expiry                             |
| **Path**           | `/api/v1/notifications/*`                                                  |
| **Header**         | `Authorization: Bearer <oauth2_token>`                                     |
| **Duration**       | Token: typically 1 hour. Can be refreshed with client credentials          |
| **Scope**          | `notify` scope                                                             |
| **Best for**       | Enterprise integrations, higher security, audit compliance, token rotation |

---

### Credential Lifecycle

**OAuth2 Client Credentials Flow:**

1. Admin creates tenant via `/api/v1/admin/tenants` (JWT auth)
2. Notify backend calls CSTAR API to create tenant + OAuth2 credentials (client_id + secret)
3. Credentials returned to admin (must be stored securely)
4. Service uses credentials to exchange for token at Keycloak
5. Service calls Notify with Bearer token
6. When token expires (default 1 hour), service exchanges credentials again

### OAuth2 Client Credentials Registration Flow

1. Admin authenticates with JWT and calls `/api/v1/admin/tenants/{tenantId}/credentials/oauth2`
   (POST)
2. Notify backend validates JWT and authorization (admin for that tenant)
3. Notify backend calls CSTAR API to:
   - Ensure tenant exists (created during tenant registration)
   - Generate OAuth2 credentials
4. CSTAR returns:
   ```json
   {
     "id": "credential-oauth2-123",
     "client_id": "notify-client-abc123",
     "client_secret": "notify_secret_xyz789...",
     "tenantId": "tenant-uuid"
   }
   ```
5. Notify stores credential metadata in database (id, tenant_id, client_id, created_at, etc.)
6. Client ID and secret returned to admin (displayed once, with strong warning to store securely)
7. Service uses credentials to exchange for token:
   ```bash
   curl -X POST https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/token \
     -d "grant_type=client_credentials" \
     -d "client_id=notify-client-abc123" \
     -d "client_secret=notify_secret_xyz789..." \
     -d "scope=notify"
   ```
8. Service uses resulting token in `Authorization: Bearer <token>` header

### JWT Setup

1. API Gateway JWT plugin is configured with the issuer secret
2. Users authenticate with CSS SSO and receive JWT
3. Tokens are validated by API Gateway on each request
4. No manual management needed - relies on SSO token issuance

---

## Network Isolation

Backend services are not publicly accessible.

- No public route to:
  - Notify API
  - Admin API
- Only API Gateway url is exposed externally

### Network Policy

Restrict traffic so that only the API Gateway can communicate with backend services.

---

## Frontend Proxy (Vite / Caddy)

Frontend should proxy all requests through the API Gateway since they're setup to validate JWT
tokens and OAuth2 tokens. Sounds wrong on the surface because this could overburden the API Gateway,
but this is a standard pattern.

---

## Identity Propagation

API Gateway injects identity headers after validating authentication (JWT or OAuth2). These headers
allow the backend to identify and track the requesting tenant.

### API Gateway Header Injection Flow

```mermaid
sequenceDiagram
    participant Client as "Client<br/>(JWT or OAuth2)"
    participant Gateway as "API Gateway"
    participant Backend as "Notify Backend"

    Client->>Gateway: Request (with auth header)
    Gateway->>Gateway: ✓ Validate JWT/OAuth2<br/>✓ Extract tenant context
    Note over Gateway: API Gateway injects headers:<br/>X-Tenant-ID<br/>X-Consumer-Username<br/>X-Consumer-ID

    Gateway->>Backend: Forward request<br/>+ Gateway headers
    Backend->>Backend: ✓ Extract headers<br/>✓ Validate tenant with CSTAR<br/>✓ Process request
    Backend-->>Gateway: Response
    Gateway-->>Client: Response
```

### API Gateway Headers Added to Request

After successful authentication, API Gateway adds:

| Header                | Example Value                          | Purpose                                |
| --------------------- | -------------------------------------- | -------------------------------------- |
| `X-Tenant-ID`         | `550e8400-e29b-41d4-a716-446655440000` | Tenant UUID from API Gateway           |
| `X-Consumer-Username` | `bchealth`                             | Tenant identifier (from API Gateway)   |
| `X-Consumer-ID`       | `550e8400-e29b-41d4-a716-446655440000` | API Gateway's internal UUID for tenant |

### Backend Usage

Notify API uses these headers to:

- **Identify tenant**: Look up tenant in database by `X-Tenant-ID` or `X-Consumer-Username`
- **Validate tenant**: Query CSTAR to confirm tenant exists and is active
- **Track requests**: Log both DB ID (internal) and API Gateway IDs (gateway-level audit)
- **Apply authorization**: Ensure tenant can perform the requested action

---

## Responsibilities Breakdown

### API Gateway

- Enforces authentication
- Validates API keys and JWTs
- Routes traffic
- Injects identity headers

---

### CSTAR - Connected Services, Team Access & Roles

CSTAR is a BC Gov platform service that manages:

- **Initiative Workspaces (Tenants)**: Isolated workspaces for service delivery teams
- **User and Role Management**: Add users to tenants and assign roles with permissions
- **API Credential Generation**: Create API keys and OAuth2 client credentials for service
  integrations
- **Connected Services Integration**: Manage access to shared BC Gov services and resources

Notify leverages CSTAR for tenant management instead of building this capability separately.

---

### Notify API

- Sends messages
- Resolves tenant via headers
- Applies business logic
- Does NOT validate API keys or JWT tokens

---

### Notify Admin Portal

- Authenticates users via JWT (from CSS SSO)
- Integrates with CSTAR to manage tenant workspaces and users
- Calls CSTAR API to generate credentials for tenants
- Provides Notify-specific features (template management, message history, analytics)
- Does NOT manage tenants or credentials directly; delegates to CSTAR

---

## Deployment Notes

Work in progress, need to chat with Nick about pipeline changes that will be needed

---

## Managing CSTAR Resources

## Overview

Notify integrates with CSTAR to manage:

- **Tenants (Initiative Workspaces)**: Create and manage tenant workspaces
- **API Credentials**: Generate API keys and OAuth2 client credentials for tenants
- **User Roles**: Assign roles and permissions to users within tenants

### CSTAR API Integration

Notify backend calls CSTAR API endpoints:

**Base URL**: (To be confirmed with CSTAR team - likely deployed in OpenShift)

**Endpoints**:

- `POST /api/tenants` - Create a new tenant workspace
- `POST /api/tenants/{tenantId}/credentials/oauth2` - Generate OAuth2 credentials for tenant
- `GET /api/tenants/{tenantId}` - Retrieve tenant details
- `GET /api/tenants/{tenantId}/users` - Get tenant users (for user management)

### Authentication to CSTAR

Notify backend authenticates to CSTAR using **Keycloak service account**:

```typescript
// Service account flow (same as CSTAR approach)
const token = await getKeycloakServiceToken(
  process.env.KEYCLOAK_SERVICE_CLIENT_ID,
  process.env.KEYCLOAK_SERVICE_CLIENT_SECRET,
  'cstar', // scope for CSTAR access
)

const response = await axios.post(
  `${CSTAR_API_URL}/api/tenants`,
  { name: tenantName, description: tenantDescription },
  { headers: { Authorization: `Bearer ${token}` } },
)
```

## Key Concepts

### Tenant = Initiative Workspace (in CSTAR)

In CSTAR terminology, a "Tenant" in Notify is represented as an "Initiative Workspace" - an isolated
environment where a service delivery team can work with Notify and other connected services.

### Credentials = API Keys or OAuth2 Client Credentials (Generated by CSTAR)

Credentials are issued by CSTAR and validated by the API Gateway:

- **API Keys**: Static keys for simple direct API usage
- **OAuth2 Client Credentials**: Client ID + Secret for token-based authentication

---

## Integration Workflow

### 1. Notify Admin Creates Tenant Workspace

Notify admin requests tenant creation via Notify Admin Portal (with JWT):

```
Admin (JWT) → Notify Admin Portal → CSTAR API → Create Initiative Workspace
                                                   ↓
                                            Tenant workspace created in CSTAR
```

### 2. CSTAR Generates API Credentials

Notify Admin Portal calls CSTAR to generate credentials:

```
Notify calls CSTAR (service token) → Generate API Key or OAuth2 Credentials
                                     ↓
                                Credentials returned to Notify
```

### 3. Notify Returns Credentials to Tenant

Credentials are displayed once to the tenant admin (must be stored securely):

```
Notify Admin → Tenant Admin: "Store these credentials securely"
                            - API Key: notify_key_...
                            - OR Client ID: notify-client-...
                              Client Secret: notify_secret_...
```

### 4. Tenant Uses Credentials to Call Notify API

Tenant service includes credential in every API call:

```
Tenant Service → API Gateway: Validate credential
                              ↓
                     OAuth2 validates (via Keycloak) OR
                     API Key validates (via CSTAR tenant lookup)
                              ↓
                     Inject X-Consumer-Username header
                              ↓
                              → Notify Backend
```

    id
    key

} }

```

---

## Authentication

All requests require a service account token:

Authorization: Bearer <token>

---

## NestJS Integration Pattern

### GraphQL Helper

Create an axios helper that will call the graphql endpoints

e.g. to create tenants, link users to tenants, generate api keys (?)

All done in the backend, axios calls using GraphQL to the API Gateway
```
