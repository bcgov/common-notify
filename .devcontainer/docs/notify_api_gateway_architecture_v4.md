# Notify API – Gateway & API Key Design v4

## 1. Overview

We are building a Notify service that allows tenants to send emails/sms/messages/etc. via an API. We
are also building an admin component that allows users to create templates for their messages, as
well as other admin tasks.

TBD - CSTAR - Need to understand this. Is it running? Can we use it? Is it effectively the APS
Gateway? Dig in.

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

These three pieces of information should allow us to identify the tenant of all requests, the user
of all requests, and (if an API key is supplied) the API key _ID_ (not the api key itself).

Need to figure out how CSTAR comes into play here. If I understand Chris correctly, we will use
CSTAR for tenant and API key management. However, Jason mentioned that CSTAR isn't available, and
may not be until "later". So I'll need to better understand this.

### Simple Flow

Quick and dirty version: we'll want to route everything through the API gateway. They validate api
keys, JWTs, and OAuth2 tokens (we can use the jwt plugin, key-auth plugin, and oauth2 plugin for
these three purposes). The API gateway proxies requests to Notify. We create a network policy in
OpenShift that only accepts traffic to the backend from the API Gateway. In this way, we know that
any requests to the backend are valid requests.

### 1. User/Admin Flow (JWT)

```mermaid
flowchart LR
    User -->|Browser| Frontend[Frontend UI<br/>Caddy/Vite]
    CSS["CSS SSO<br/>(Keycloak)"]
    ServiceAccount["Service Account<br/>(Keycloak)"]

    User -->|Login| CSS
    CSS -->|JWT Token| User
    Frontend -->|Admin Request + JWT| Gateway[API Gateway]
    Gateway -->|Validate + Inject Headers| AdminAPI[Notify Admin API]
    AdminAPI -->|1. Get Service Token| ServiceAccount
    AdminAPI -->|2. Create Tenant<br/>+Generate Credentials| APS[APS Management API]

    style Gateway fill:#ff9800
    style Frontend fill:#4CAF50
    style AdminAPI fill:#4CAF50
    style CSS fill:#9C27B0
    style ServiceAccount fill:#9C27B0
    style APS fill:#ff9800
```

### 2. API Key Flow (Direct Service Integration)

```mermaid
flowchart LR
    Service["External Service<br/>(Application)"]

    Service -->|POST /api/v1/notifications/send<br/>x-api-key: key-123| Gateway[API Gateway]
    Gateway -->|Validate Key<br/>Inject Headers| NotifyAPI[Notify Notification API]
    NotifyAPI -->|Send Email/SMS| Email["CHES/Twilio<br/>Providers"]

    style Gateway fill:#ff9800
    style Service fill:#ff6b6b
    style NotifyAPI fill:#4CAF50
    style Email fill:#2196F3
```

### 3. Client Credentials Flow (OAuth2 Service Integration)

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

### Key Points

- **Three authentication paths**: JWT (User), API Key (Service), OAuth2 Client Credentials (Service)
- **Frontend** (Caddy/Vite) is the entry point for user/admin interactions
- **API Gateway** is the single entry point for all API requests (enforces authentication, injects
  headers)
- **External Services** can use either simple API keys or OAuth2 client credentials
- API Gateway validates credentials and injects tenant headers
- Admin API creates credentials (via APS Management API)
- Notify API processes email requests
- Backend services are not publicly accessible (again, only route to the backend is via the API
  Gateway). This results in a trusted private route that only the API Gateway can access. No need to
  double-validate JWTs or API Keys

---

## 2. Architecture Review (Detailed View)

### System Components

| Component          | Responsibility                                              |
| ------------------ | ----------------------------------------------------------- |
| API Gateway        | Auth (JWT + API Key + OAuth2), routing, identity injection. |
| JWT Plugin         | Validates JWT signatures and claims                         |
| Key-Auth Plugin    | Validates API keys                                          |
| OAuth2 Plugin      | Handles client credentials flow, token issuance             |
| APS Management API | Consumer + credential management (maybe use CSTAR?)         |
| Frontend UI        | Admin interface (authenticates via JWT)                     |
| Notify API         | Core messaging functionality                                |
| Notify Admin API   | Tenant + API key management                                 |
| CSS / Keycloak     | OAuth / SSO (issues JWT tokens)                             |

---

## Detailed Flow

### User/Frontend Flow (JWT Authentication)

Work in progress, may need to use a service account to connect the Notify backend to the API
Gateway. But we also want to maintain user information of those making the requests.

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
    Gateway->>AdminAPI: Forward request + headers
    AdminAPI-->>Gateway: Response
    Gateway-->>Frontend: Response
    Frontend-->>User: Response
```

### Service/Email Flow (API Key Authentication)

```mermaid
sequenceDiagram
    participant Service
    participant Gateway as "API Gateway"
    participant API as "Notify Email API"

    Service->>Gateway: POST /api/v1/notifications/send<br/>x-api-key: [key]
    Gateway->>Gateway: Validate API key
    Gateway->>Gateway: Lookup consumer/tenant
    Gateway->>API: Forward request + headers
    API-->>Gateway: Response
    Gateway-->>Service: Response
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
    Gateway->>Gateway: Lookup consumer/tenant
    Gateway->>API: Forward request + headers
    API-->>Gateway: Response
    Gateway-->>Service: Response
```

### Credential Management Flow

```mermaid
sequenceDiagram
    participant Admin
    participant Frontend as "Frontend<br/>(Admin UI)"
    participant Gateway as "API Gateway"
    participant AdminAPI as "Notify Admin API"
    participant Keycloak as "Keycloak<br/>(Service Account)"
    participant APS as "APS Management API"

    Admin->>Frontend: Create tenant/credentials request (with JWT)
    Frontend->>Gateway: Proxy request + JWT
    Gateway->>AdminAPI: Forward to Admin API

    Note over AdminAPI: Step 1: Get Service Account Token
    AdminAPI->>Keycloak: POST /token<br/>grant_type: client_credentials<br/>client_id: notify-service
    Keycloak-->>AdminAPI: {access_token: jwt}

    Note over AdminAPI: Step 2: Create Consumer (one-time)
    AdminAPI->>APS: mutation: createConsumer<br/>Authorization: Bearer [service token]
    APS-->>AdminAPI: {id: consumer-uuid}

    Note over AdminAPI: Step 3a: Create API Key
    AdminAPI->>APS: mutation: createApiKey(consumerId)<br/>Authorization: Bearer [service token]
    APS-->>AdminAPI: {key: "notify_key_...", id: cred-id}

    Note over AdminAPI: Step 3b: Create OAuth2 Credentials
    AdminAPI->>APS: mutation: createOAuth2Credentials(consumerId)<br/>Authorization: Bearer [service token]
    APS-->>AdminAPI: {client_id: "...", client_secret: "...", id: cred-id}

    AdminAPI-->>Gateway: Response (API Key OR OAuth2 Credentials)
    Gateway-->>Frontend: Response
    Frontend-->>Admin: Display new credentials (one-time display)
```

---

## API Gateway Authentication Plugins

API Gateway uses **three authentication plugins** to handle all authentication flows:

### 1. JWT Plugin (for User/Frontend Auth)

The **JWT plugin** validates JSON Web Tokens issued by your OAuth provider (CSS SSO).

**How it works:**

1. User logs in via CSS → receives signed JWT
2. Frontend includes JWT in `Authorization: Bearer <token>` header
3. API Gateway JWT plugin validates:
   - JWT signature (using configured secret)
   - Token expiration (`exp` claim)
   - Issuer claim (`iss`) matches a registered consumer
4. API Gateway injects headers and forwards to backend

### 2. Key-Auth Plugin (for Service/Simple Auth)

The **key-auth plugin** validates static API keys for direct API usage.

**How it works:**

1. Service includes API key in `x-api-key` header
2. API Gateway key-auth plugin validates:
   - Key exists and is active
   - Key belongs to a valid consumer/tenant
3. API Gateway injects headers and forwards to backend

**Request Format:**

```http
POST /api/v1/notifications/send
x-api-key: test-api-key-a-12345678901234567890
Content-Type: application/json

{"type": "email", "recipient": "user@example.com", ...}
```

**Pros**: Simple, no token exchange needed **Cons**: Static key must be included in every request

---

### 3. OAuth2 Plugin (for Service/Enterprise Auth)

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

API Gateway requires three authentication plugins to be installed and configured on routes. This is
setup via the files in .api-gateway (need to integrate this into the pipeline so that dev/test/prod
use the correct gateways).

### Plugin Installation

- `jwt` - JSON Web Token authentication (for UI/admin users)
- `key-auth` - Static API key authentication (for services)
- `oauth2` - OAuth2 client credentials flow (for services)

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

### 2. API Key Method (Service/Direct API)

| Property       | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| **Use case**   | Services call Notify to send emails/SMS directly                     |
| **Key source** | Generated via APS Management API (called from Notify admin endpoint) |
| **Validation** | API Gateway                                                          |
| **Path**       | `/api/v1/notifications/*`                                            |
| **Header**     | `x-api-key: <static_key>`                                            |
| **Duration**   | Indefinite (until revoked)                                           |
| **Scope**      | Full access (tenant-scoped via APS consumer)                         |
| **Best for**   | Simple integrations, direct API usage, lower security requirements   |

### 3. OAuth2 Client Credentials (Service/Token-Based)

| Property           | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Use case**       | Services securely exchange credentials for temporary tokens                |
| **Credentials**    | Client ID + Client Secret (generated via APS Management API)               |
| **Token exchange** | POST to Keycloak `/protocol/openid-connect/token`                          |
| **Validation**     | API Gateway validates JWT signature and expiry                             |
| **Path**           | `/api/v1/notifications/*`                                                  |
| **Header**         | `Authorization: Bearer <oauth2_token>`                                     |
| **Duration**       | Token: typically 1 hour. Can be refreshed with client credentials          |
| **Scope**          | `notify` scope                                                             |
| **Best for**       | Enterprise integrations, higher security, audit compliance, token rotation |

---

### Credential Lifecycle

**API Key Flow:**

1. Admin creates tenant via `/api/v1/admin/tenants` (JWT auth)
2. Notify backend calls APS API to create consumer + generate API key
3. API key returned to admin (displayed once, must be stored securely)
4. Service uses API key in `x-api-key` header indefinitely

**OAuth2 Client Credentials Flow:**

1. Admin creates tenant via `/api/v1/admin/tenants` (JWT auth)
2. Notify backend calls APS API to create consumer + OAuth2 credentials (client_id + secret)
3. Credentials returned to admin (must be stored securely)
4. Service uses credentials to exchange for token at Keycloak
5. Service calls Notify with Bearer token
6. When token expires (default 1 hour), service exchanges credentials again

---

### API Key Registration Flow

1. Admin authenticates with JWT and calls `/api/v1/admin/tenants/{tenantId}/credentials/api-key`
   (POST)
2. Notify backend validates JWT and authorization (admin for that tenant)
3. Notify backend calls APS Management API to:
   - Ensure consumer exists (created during tenant registration)
   - Generate new API key via GraphQL mutation
4. APS returns:
   ```json
   {
     "id": "credential-123",
     "key": "notify_key_abc123def456...",
     "consumerId": "consumer-uuid"
   }
   ```
5. Notify stores credential metadata in database (id, consumer_id, created_at, last_used, etc.)
6. API key returned to admin (displayed once, with warning to store securely)
7. Service uses key in `x-api-key: notify_key_abc123def456...` header

### OAuth2 Client Credentials Registration Flow

1. Admin authenticates with JWT and calls `/api/v1/admin/tenants/{tenantId}/credentials/oauth2`
   (POST)
2. Notify backend validates JWT and authorization (admin for that tenant)
3. Notify backend calls APS Management API to:
   - Ensure consumer exists (created during tenant registration)
   - Generate OAuth2 credentials via GraphQL mutation
4. APS returns:
   ```json
   {
     "id": "credential-oauth2-123",
     "client_id": "notify-client-abc123",
     "client_secret": "notify_secret_xyz789...",
     "consumerId": "consumer-uuid"
   }
   ```
5. Notify stores credential metadata in database (id, consumer_id, client_id, created_at, etc.)
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

Frontend should proxy all requests through the API Gateway since they're setup to validate API Keys
and JWTs. Sounds wrong on the surface because this could overburden the API Gateway, but this is a
standard pattern.

---

## Identity Propagation

API Gateway injects identity headers after validating the API key. These headers allow the backend
to identify and track the authenticated consumer.

### API Gateway Header Injection Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as "API Gateway"
    participant Backend as "Notify Backend"

    Client->>Gateway: POST /api/v1/email/send<br/>(with apikey header)
    Gateway->>Gateway: ✓ Validate API key<br/>✓ Lookup consumer
    Note over Gateway: API Gateway injects headers:<br/>X-Consumer-Username<br/>X-Consumer-ID<br/>X-Credential-ID

    Gateway->>Backend: Forward request<br/>+ Gateway headers
    Backend->>Backend: ✓ Extract headers<br/>✓ Lookup tenant<br/>✓ Process request
    Backend-->>Gateway: Response
    Gateway-->>Client: Response
```

### API Gateway Headers Added to Request

After successful API key validation, API Gateway adds:

| Header                | Example Value                          | Purpose                                  |
| --------------------- | -------------------------------------- | ---------------------------------------- |
| `X-Consumer-Username` | `bchealth`                             | Tenant identifier (API Gateway consumer) |
| `X-Consumer-ID`       | `550e8400-e29b-41d4-a716-446655440000` | API Gateway's internal UUID for consumer |
| `X-Credential-ID`     | `key-123-abc`                          | The specific API key ID                  |

### Backend Usage

Notify API uses these headers to:

- **Authenticate**: Confirm the API key was validated by API Gateway
- **Identify tenant**: Look up tenant in database by `X-Consumer-Username`
- **Track requests**: Log both DB ID (internal) and API Gateway ID (gateway-level audit)
- **Apply authorization**: Ensure tenant can perform the requested action

---

## Responsibilities Breakdown

### API Gateway

- Enforces authentication
- Validates API keys and JWTs
- Routes traffic
- Injects identity headers

---

### APS Management API (or CSTAR)

- Manages consumers (tenants)
- Issues API keys (credentials)

---

### Notify API

- Sends messages
- Resolves tenant via headers
- Applies business logic
- Does NOT validate API keys or JWT tokens

---

### Notify Admin Portal

- Authenticates users
- Calls APS using service account
- Creates tenants + API keys via API Gateway or CSTAR
- Stores metadata

---

## Deployment Notes

Work in progress, need to chat with Nick about pipeline changes that will be needed

---

## Managing APS Resources

## Overview

Use GraphQL API to manage API Gateway resources such as:

- Consumers (tenants)
- API Keys (credentials)
- Gateway associations (namespaces)

Endpoint:

https://api.gov.bc.ca/gql/api

I think we create a service account to execute mutations here, but again, need to think more about
this.

---

## Key Concepts

### Consumer = Tenant

Represents a tenant in Notify.

---

## Required Flow

### 1. Create Consumer

I'm using devtools on my browser to figure this out on the
https://api.gov.bc.ca/manager/gateways/detail site, it's probably documented somewhere though (but I
can't find it)

Expected mutation:

```graphql
mutation CreateConsumer($input: CreateConsumerInput!) {
  createConsumer(input: $input) {
    id
    username
  }
}
```

---

### 2. Link Consumer to Namespace

For now, the dev namespace it ns.gw-fe8c5. This was created when we created the gateway. This may
change as I repeat these steps.

At the very least, test/prod will have different namespaces (I haven't created these yet)

```graphql
mutation LinkConsumerToNamespace($username: String!) {
  linkConsumerToNamespace(username: $username)
}
```

Variables:

```json
{
  "username": "tenant-name"
}
```

---

### 3. Create API Key

(Not yet captured — must be retrieved from DevTools)

Expected mutation:

```graphql
mutation CreateCredential($consumerId: ID!) {
  createCredential(consumerId: $consumerId) {
    id
    key
  }
}
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
