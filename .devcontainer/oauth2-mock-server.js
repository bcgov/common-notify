const express = require('express')
const crypto = require('crypto')

const app = express()
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Test credentials (must match kong-seed.sh and Kong JWT credentials)
// Note: These secrets are used to sign JWTs expected by Kong's JWT plugin
const testClients = {
  'LOCAL001-ABC123': 'LOCAL001-SECRET-ABC123XYZ789',
  'LOCAL002-DEF456': 'LOCAL002-SECRET-DEF456XYZ789',
  'LOCAL003-GHI789': 'LOCAL003-SECRET-GHI789XYZ789',
  'sa-notify-service': 'notify-service-secret-12345678901234', // Service account for API key management
}

// JWT signing secrets (must match Kong JWT credentials created with 'secret' field)
const jwtSecrets = {
  'LOCAL001-ABC123': 'jwt-secret-local001',
  'LOCAL002-DEF456': 'jwt-secret-local002',
  'LOCAL003-GHI789': 'jwt-secret-local003',
  'sa-notify-service': 'notify-service-secret-12345678901234', // Same as client secret for service account
}

// Issuer (should match API_GATEWAY_KEYCLOAK_ISSUER in backend)
const keycloakIssuer =
  process.env.API_GATEWAY_KEYCLOAK_ISSUER || 'https://test.loginproxy.gov.bc.ca/auth/realms/apigw'

// Local CSTAR tenant IDs aligned to seeded Notify tenant.external_id values.
const TENANT_1_ID = 'e936010f-bb93-4430-87d9-e6e70b63e75f'
const TENANT_2_ID = 'd4380e35-68be-40c2-82b6-f3a00e080446'
const TENANT_3_ID = '44e8b879-3591-4180-a155-49d441f82284'

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// OAuth2 Token Endpoint
// Kong will route POST /oauth2/token to POST /
app.post('/', (req, res) => {
  const { grant_type, client_id, client_secret, scope } = req.body

  console.log('[oauth2-mock] Token request:', { grant_type, client_id, scope })

  // Validate grant type
  if (grant_type !== 'client_credentials') {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Grant type must be client_credentials',
    })
  }

  // Validate client credentials
  if (!client_id || !client_secret) {
    return res.status(400).json({
      error: 'invalid_client',
      error_description: 'client_id and client_secret are required',
    })
  }

  const expectedSecret = testClients[client_id]
  if (!expectedSecret || expectedSecret !== client_secret) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'client_id or client_secret is invalid',
    })
  }

  // Validate scopes if provided (accept all for local development)
  // In production, Kong's OAuth2 plugin would validate registered scopes
  if (scope) {
    // Just log the requested scope for debugging
    console.log(`[oauth2-mock] Token requested with scope: ${scope}`)
  }

  // Generate a signed JWT token (HS256)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub: client_id,
    azp: client_id, // Authorized Party - the client ID authorized to use this token
    iss: keycloakIssuer, // Issuer (service realm)
    scope: scope || 'notify',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + 3600000) / 1000),
  }

  // Helper function to base64url encode
  const base64urlEncode = (str) =>
    Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const headerEncoded = base64urlEncode(JSON.stringify(header))
  const payloadEncoded = base64urlEncode(JSON.stringify(payload))
  const message = `${headerEncoded}.${payloadEncoded}`

  // Sign the message with HMAC-SHA256 using the JWT secret
  const secret = jwtSecrets[client_id]
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  const token = `${message}.${signature}`

  res.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: scope || 'notify',
  })
})

// CSTAR API Mock Endpoints
// These endpoints simulate the CSTAR API for role and tenant lookups

/**
 * GET /api/v1/users/:ssoUserId/tenants
 * Returns list of tenants accessible to the user
 *
 * Used by: Frontend (fetchCstarTenants) and Backend (NotifyFrontendRoleGuard)
 * Returns: Array of tenant objects with id, name
 */
app.get('/api/v1/users/:ssoUserId/tenants', (req, res) => {
  const { ssoUserId } = req.params

  // Mock data: Different users have access to different tenants
  const userTenants = {
    'user-001': [
      {
        id: TENANT_1_ID,
        name: 'Notify Test Tenant 1',
        ministryName: 'Test Ministry 1',
        description: 'Local test tenant 1',
      },
      {
        id: TENANT_2_ID,
        name: 'Notify Test Tenant 2',
        ministryName: 'Test Ministry 2',
        description: 'Local test tenant 2',
      },
    ],
    'user-002': [
      {
        id: TENANT_2_ID,
        name: 'Notify Test Tenant 2',
        ministryName: 'Test Ministry 2',
        description: 'Local test tenant 2',
      },
    ],
    'user-003': [
      {
        id: TENANT_1_ID,
        name: 'Notify Test Tenant 1',
        ministryName: 'Test Ministry 1',
        description: 'Local test tenant 1',
      },
      {
        id: TENANT_3_ID,
        name: 'Notify Test Tenant 3',
        ministryName: 'Test Ministry 3',
        description: 'Local test tenant 3',
      },
    ],
  }

  const tenants = userTenants[ssoUserId] || []

  res.json({
    data: tenants,
  })
})

/**
 * GET /api/v1/tenants/:tenantId/ssousers/:ssoUserId/shared-service-roles
 * Returns list of roles a user has in a specific tenant for Notify service
 *
 * Used by: Backend (NotifyFrontendRoleGuard) and Frontend (fetchCstarRoles)
 * Returns: Object with sharedServiceRoles array containing role names
 */
app.get('/api/v1/tenants/:tenantId/ssousers/:ssoUserId/shared-service-roles', (req, res) => {
  const { tenantId, ssoUserId } = req.params

  // Mock data: Different users have different roles in different tenants
  const userRoles = {
    'user-001': {
      [TENANT_1_ID]: [
        {
          id: 'role-1',
          name: 'NOTIFY_OPERATIONS_ADMIN',
          description: 'Full admin access',
        },
      ],
      [TENANT_2_ID]: [
        {
          id: 'role-2',
          name: 'NOTIFY_TEMPLATE_EDITOR',
          description: 'Can create and edit templates',
        },
      ],
    },
    'user-002': {
      [TENANT_2_ID]: [
        {
          id: 'role-3',
          name: 'NOTIFY_VIEWER',
          description: 'Read-only access',
        },
      ],
    },
    'user-003': {
      [TENANT_1_ID]: [
        {
          id: 'role-4',
          name: 'NOTIFY_TEMPLATE_EDITOR',
          description: 'Can create and edit templates',
        },
      ],
      [TENANT_3_ID]: [
        {
          id: 'role-5',
          name: 'NOTIFY_VIEWER',
          description: 'Read-only access',
        },
      ],
    },
  }

  // Get roles for this user in this tenant
  const roles = userRoles[ssoUserId]?.[tenantId] || []

  res.json({
    data: {
      sharedServiceRoles: roles,
    },
  })
})

// ---------------------------------------------------------------------------
// APS Directory API Mock — Credential Issuer
//
// The real Credential Issuer API (/ds/api/v3/gateways/{id}/consumers) is only
// deployed on the APS *test* instance, and the Notify environment published there
// is client-credentials rather than an api-key flow. Neither can issue a key that
// works against our gateway, so there is nowhere real to point local development at.
//
// This mock stands in for it, backed by the Kong running in docker-compose: it
// creates the same artefacts the real API does — a consumer whose username is a
// {environmentAppId}-{applicationAppId} clientId, plus a key-auth credential — so
// the resulting key actually authenticates against local routes.
//
// The point is that the backend then exercises ApsCredentialIssuerClient, the class
// that runs in production: token fetch and caching, the refresh-and-retry on 401,
// the request body shape, and the 400/403/409 error mapping. Responses and status
// codes below mirror the real API deliberately.
//
// Caveat worth remembering: a mock agrees with our own reading of the contract by
// construction. It raises confidence in our code, not in our reading of APS.
// ---------------------------------------------------------------------------

const KONG_ADMIN_URL = process.env.KONG_ADMIN_URL || 'http://kong:8001'
const GATEWAY_ID = process.env.APS_GATEWAY_ID || 'gw-local'
const ENVIRONMENT_APP_ID = process.env.APS_ENVIRONMENT_APP_ID || 'LOCAL001'
// Matches the published flow on the real gw-fe8c5 environments.
const ENVIRONMENT_FLOW = 'kong-api-key-only'

/**
 * Verify a token this server issued.
 *
 * Real signature checking rather than "is a header present", so the client's token
 * handling is genuinely under test — an expired or forged token produces the same
 * 401 the real API would, which is what drives the refresh-and-retry path.
 */
function verifyBearer(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'credentials_required', message: 'No authorization token was found' }
  }

  const parts = header.slice('Bearer '.length).trim().split('.')
  if (parts.length !== 3) {
    return { ok: false, status: 401, code: 'invalid_token', message: 'Malformed token' }
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
  } catch {
    return { ok: false, status: 401, code: 'invalid_token', message: 'Malformed token payload' }
  }

  const secret = jwtSecrets[payload.azp]
  if (!secret) {
    return { ok: false, status: 401, code: 'invalid_token', message: 'Unknown client' }
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  if (expected !== parts[2]) {
    return { ok: false, status: 401, code: 'invalid_token', message: 'Signature verification failed' }
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 401, code: 'invalid_token', message: 'Token expired' }
  }

  return { ok: true, clientId: payload.azp }
}

/** Reject anything that isn't a validly signed token from this server. */
app.use('/ds/api/v3', (req, res, next) => {
  const result = verifyBearer(req)
  if (!result.ok) {
    console.log(`[aps-mock] ${req.method} ${req.path} -> ${result.status} ${result.code}`)
    return res.status(result.status).json({ code: result.code, message: result.message })
  }
  next()
})

async function kong(method, path, body) {
  const response = await fetch(`${KONG_ADMIN_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: response.status, data }
}

/**
 * GET /ds/api/v3/gateways/:gatewayId/products
 *
 * Mirrors the lookup that supplies APS_ENVIRONMENT_APP_ID, so the setup steps in
 * docs/api-key-self-service.md can be walked through locally.
 */
app.get('/ds/api/v3/gateways/:gatewayId/products', (req, res) => {
  // Scoped like the issue route below. Without this the mock is more permissive than the
  // real API in exactly the dimension that has already cost time twice: a wrong
  // APS_GATEWAY_ID would look fine here and fail only later, against real APS.
  if (req.params.gatewayId !== GATEWAY_ID) {
    return res.status(403).json({
      code: 'permission_denied',
      message: `Missing required scope: ${req.params.gatewayId}:Namespace.Manage`,
    })
  }

  res.json([
    {
      name: 'Notify API',
      environments: [
        { name: 'dev', flow: ENVIRONMENT_FLOW, appId: ENVIRONMENT_APP_ID, active: true },
      ],
    },
  ])
})

/**
 * POST /ds/api/v3/gateways/:gatewayId/consumers — issue a credential.
 *
 * Creates a Kong consumer named for the clientId plus a key-auth credential, and
 * returns the APS-shaped response. 201 on success.
 */
app.post('/ds/api/v3/gateways/:gatewayId/consumers', async (req, res) => {
  const { gatewayId } = req.params
  const { environmentAppId, application, labels } = req.body || {}

  // The real API scopes the service account per gateway, so a wrong APS_GATEWAY_ID
  // surfaces as a scope failure rather than a confusing 404.
  if (gatewayId !== GATEWAY_ID) {
    return res.status(403).json({
      code: 'permission_denied',
      message: `Missing required scope: ${gatewayId}:CredentialIssuer.Generate`,
    })
  }
  if (environmentAppId !== ENVIRONMENT_APP_ID) {
    return res.status(400).json({
      code: 'bad_request',
      message: `Unknown environmentAppId "${environmentAppId}" (this gateway has "${ENVIRONMENT_APP_ID}")`,
    })
  }
  if (!application || (!application.name && !application.appId)) {
    return res.status(400).json({
      code: 'bad_request',
      message: 'application.name is required when creating a new Application',
    })
  }

  // Reuse the caller's Application id when given one, otherwise mint a short opaque
  // id the way APS does — the readable part comes from the Application name.
  const applicationAppId =
    application.appId ||
    `${String(application.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`
  const clientId = `${environmentAppId}-${applicationAppId}`

  try {
    const existing = await kong('GET', `/consumers/${encodeURIComponent(clientId)}`)
    if (existing.status === 200) {
      // "A duplicate issue request for the same Application and Environment fails."
      return res.status(409).json({
        code: 'conflict',
        message: 'A credential already exists for this Application and Environment',
      })
    }

    const created = await kong('POST', '/consumers', {
      username: clientId,
      custom_id: clientId,
      tags: Object.entries(labels || {}).map(([k, v]) => `${k}:${v}`),
    })
    if (created.status >= 400) {
      console.error('[aps-mock] Kong consumer creation failed:', created.status, created.data)
      return res.status(502).json({ code: 'upstream_error', message: 'Kong rejected the consumer' })
    }

    const credential = await kong('POST', `/consumers/${encodeURIComponent(clientId)}/key-auth`, {})
    if (credential.status >= 400) {
      console.error('[aps-mock] Kong key-auth creation failed:', credential.status, credential.data)
      return res.status(502).json({ code: 'upstream_error', message: 'Kong rejected the credential' })
    }

    console.log(`[aps-mock] issued ${clientId} (kong credential ${credential.data.id})`)
    res.status(201).json({ flow: ENVIRONMENT_FLOW, clientId, apiKey: credential.data.key })
  } catch (error) {
    console.error('[aps-mock] issue failed:', error)
    res.status(502).json({ code: 'upstream_error', message: 'Could not reach the local Kong Admin API' })
  }
})

/**
 * PUT /ds/api/v3/gateways/:gatewayId/consumers/:clientId?action=regenerate
 *
 * Kong has no rotate operation, so every existing key on the consumer is dropped and
 * a fresh one minted — same net effect as the real regenerate: clientId survives, the
 * value does not.
 */
app.put('/ds/api/v3/gateways/:gatewayId/consumers/:clientId', async (req, res) => {
  const { gatewayId, clientId } = req.params

  if (gatewayId !== GATEWAY_ID) {
    return res.status(403).json({
      code: 'permission_denied',
      message: `Missing required scope: ${gatewayId}:CredentialIssuer.Generate`,
    })
  }
  if (req.query.action !== 'regenerate') {
    return res
      .status(400)
      .json({ code: 'bad_request', message: 'action must be `regenerate`' })
  }

  try {
    const consumer = await kong('GET', `/consumers/${encodeURIComponent(clientId)}`)
    if (consumer.status === 404) {
      return res.status(404).json({ code: 'not_found', message: 'No such consumer' })
    }

    const existing = await kong('GET', `/consumers/${encodeURIComponent(clientId)}/key-auth`)
    for (const key of existing.data?.data || []) {
      await kong('DELETE', `/consumers/${encodeURIComponent(clientId)}/key-auth/${key.id}`)
    }

    const credential = await kong('POST', `/consumers/${encodeURIComponent(clientId)}/key-auth`, {})
    if (credential.status >= 400) {
      console.error('[aps-mock] Kong key-auth creation failed:', credential.status, credential.data)
      return res.status(502).json({ code: 'upstream_error', message: 'Kong rejected the credential' })
    }

    console.log(`[aps-mock] regenerated ${clientId} (kong credential ${credential.data.id})`)
    res.status(200).json({ flow: ENVIRONMENT_FLOW, clientId, apiKey: credential.data.key })
  } catch (error) {
    console.error('[aps-mock] regenerate failed:', error)
    res.status(502).json({ code: 'upstream_error', message: 'Could not reach the local Kong Admin API' })
  }
})

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({
    error: 'server_error',
    error_description: 'An internal server error occurred',
  })
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => {
  console.log(` Mock OAuth2 Token Server listening on port ${PORT}`)
  console.log('')
  console.log('OAuth2 Endpoints:')
  console.log(`   POST http://localhost:${PORT}/ - OAuth2 token endpoint`)
  console.log(`   GET  http://localhost:${PORT}/health - Health check`)
  console.log('')
  console.log('CSTAR Mock Endpoints:')
  console.log(`   GET  http://localhost:${PORT}/api/v1/users/:ssoUserId/tenants`)
  console.log(
    `   GET  http://localhost:${PORT}/api/v1/tenants/:tenantId/ssousers/:ssoUserId/shared-service-roles`,
  )
  console.log('')
  console.log('APS Directory API Mock (Credential Issuer) — backed by Kong at ' + KONG_ADMIN_URL)
  console.log(`   GET  http://localhost:${PORT}/ds/api/v3/gateways/${GATEWAY_ID}/products`)
  console.log(`   POST http://localhost:${PORT}/ds/api/v3/gateways/${GATEWAY_ID}/consumers`)
  console.log(
    `   PUT  http://localhost:${PORT}/ds/api/v3/gateways/${GATEWAY_ID}/consumers/:clientId?action=regenerate`,
  )
  console.log(`   gateway=${GATEWAY_ID}  environmentAppId=${ENVIRONMENT_APP_ID}  flow=${ENVIRONMENT_FLOW}`)
  console.log('')
  console.log('Test credentials (from kong-seed.sh):')
  console.log('  - LOCAL001-ABC123: LOCAL001-SECRET-ABC123XYZ789')
  console.log('  - LOCAL002-DEF456: LOCAL002-SECRET-DEF456XYZ789')
  console.log('  - LOCAL003-GHI789: LOCAL003-SECRET-GHI789XYZ789')
  console.log('')
  console.log('Mock Users for CSTAR API:')
  console.log(
    `  - user-001: Has access to ${TENANT_1_ID} (NOTIFY_OPERATIONS_ADMIN) and ${TENANT_2_ID} (NOTIFY_TEMPLATE_EDITOR)`,
  )
  console.log(`  - user-002: Has access to ${TENANT_2_ID} (NOTIFY_VIEWER)`)
  console.log(
    `  - user-003: Has access to ${TENANT_1_ID} (NOTIFY_TEMPLATE_EDITOR) and ${TENANT_3_ID} (NOTIFY_VIEWER)`,
  )
})
