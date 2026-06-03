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
}

// JWT signing secrets (must match Kong JWT credentials created with 'secret' field)
const jwtSecrets = {
  'LOCAL001-ABC123': 'jwt-secret-local001',
  'LOCAL002-DEF456': 'jwt-secret-local002',
  'LOCAL003-GHI789': 'jwt-secret-local003',
}

// Issuer (should match API_GATEWAY_KEYCLOAK_ISSUER in backend)
const keycloakIssuer =
  process.env.API_GATEWAY_KEYCLOAK_ISSUER || 'https://dev.loginproxy.gov.bc.ca/auth/realms/apigw'

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// OAuth2 Token Endpoint
// Kong will route POST /oauth2/token to POST /
app.post('/', (req, res) => {
  const { grant_type, client_id, client_secret, scope } = req.body

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
  console.log(`   POST http://localhost:${PORT}/ - OAuth2 token endpoint`)
  console.log(`   GET  http://localhost:${PORT}/health - Health check`)
  console.log('')
  console.log('Test credentials (from kong-seed.sh):')
  console.log('  - LOCAL001-ABC123: LOCAL001-SECRET-ABC123XYZ789')
  console.log('  - LOCAL002-DEF456: LOCAL002-SECRET-DEF456XYZ789')
  console.log('  - LOCAL003-GHI789: LOCAL003-SECRET-GHI789XYZ789')
})
