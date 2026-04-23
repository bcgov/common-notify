const express = require('express')
const crypto = require('crypto')

const app = express()
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Test credentials (must match kong-seed.sh and Kong JWT credentials)
// Note: These secrets are used to sign JWTs expected by Kong's JWT plugin
const testClients = {
  'test-client-a': 'test-client-secret-a-12345678901234567890',
  'test-client-b': 'test-client-secret-b-98765432109876543210',
  'test-client-c': 'test-client-secret-c-11111111111111111111',
}

// JWT signing secrets (must match Kong JWT credentials created with 'secret' field)
const jwtSecrets = {
  'test-client-a': 'test-secret-a',
  'test-client-b': 'test-secret-b',
  'test-client-c': 'test-secret-c',
}

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
  console.log('  - test-client-a: test-client-secret-a-12345678901234567890')
  console.log('  - test-client-b: test-client-secret-b-98765432109876543210')
  console.log('  - test-client-c: test-client-secret-c-11111111111111111111')
})
