const express = require('express')
const crypto = require('crypto')

const app = express()
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Test credentials (must match kong-seed.sh)
const testClients = {
  'test-client-a': 'test-client-secret-a-12345678901234567890',
  'test-client-b': 'test-client-secret-b-98765432109876543210',
  'test-client-c': 'test-client-secret-c-11111111111111111111',
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

  // Generate a simple JWT-like token (not a real JWT for simplicity)
  const payload = {
    sub: client_id,
    scope: scope || 'notify',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + 3600000) / 1000),
  }

  // Create a mock token (sub.payload.sig format like JWT)
  const tokenPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
  const token = `mock.${tokenPayload}.${crypto.randomBytes(16).toString('hex')}`

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
  console.log(`✅ Mock OAuth2 Token Server listening on port ${PORT}`)
  console.log(`   POST http://localhost:${PORT}/ - OAuth2 token endpoint`)
  console.log(`   GET  http://localhost:${PORT}/health - Health check`)
  console.log('')
  console.log('Test credentials (from kong-seed.sh):')
  console.log('  - test-client-a: test-client-secret-a-12345678901234567890')
  console.log('  - test-client-b: test-client-secret-b-98765432109876543210')
  console.log('  - test-client-c: test-client-secret-c-11111111111111111111')
})
