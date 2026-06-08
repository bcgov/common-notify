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
        id: 'tenant-001',
        name: 'Ministry of Health',
        ministryName: 'Ministry of Health',
        description: 'MOH Tenant',
      },
      {
        id: 'tenant-002',
        name: 'Ministry of Education',
        ministryName: 'Ministry of Education',
        description: 'MOE Tenant',
      },
    ],
    'user-002': [
      {
        id: 'tenant-002',
        name: 'Ministry of Education',
        ministryName: 'Ministry of Education',
        description: 'MOE Tenant',
      },
    ],
    'user-003': [
      {
        id: 'tenant-001',
        name: 'Ministry of Health',
        ministryName: 'Ministry of Health',
        description: 'MOH Tenant',
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
      'tenant-001': [
        {
          id: 'role-1',
          name: 'NOTIFY_OPERATIONS_ADMIN',
          description: 'Full admin access',
        },
      ],
      'tenant-002': [
        {
          id: 'role-2',
          name: 'NOTIFY_TEMPLATE_EDITOR',
          description: 'Can create and edit templates',
        },
      ],
    },
    'user-002': {
      'tenant-002': [
        {
          id: 'role-3',
          name: 'NOTIFY_VIEWER',
          description: 'Read-only access',
        },
      ],
    },
    'user-003': {
      'tenant-001': [
        {
          id: 'role-4',
          name: 'NOTIFY_TEMPLATE_EDITOR',
          description: 'Can create and edit templates',
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
  console.log('Test credentials (from kong-seed.sh):')
  console.log('  - LOCAL001-ABC123: LOCAL001-SECRET-ABC123XYZ789')
  console.log('  - LOCAL002-DEF456: LOCAL002-SECRET-DEF456XYZ789')
  console.log('  - LOCAL003-GHI789: LOCAL003-SECRET-GHI789XYZ789')
  console.log('')
  console.log('Mock Users for CSTAR API:')
  console.log(
    '  - user-001: Has access to tenant-001 (NOTIFY_OPERATIONS_ADMIN) and tenant-002 (NOTIFY_TEMPLATE_EDITOR)',
  )
  console.log('  - user-002: Has access to tenant-002 (NOTIFY_VIEWER)')
  console.log('  - user-003: Has access to tenant-001 (NOTIFY_TEMPLATE_EDITOR)')
})
