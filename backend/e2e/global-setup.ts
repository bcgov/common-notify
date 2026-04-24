import { config } from 'dotenv'
import { FullConfig } from '@playwright/test'
import { join } from 'path'
import { writeFileSync } from 'fs'

// Load environment variables from .env file at project root
config({ path: join(__dirname, '../../.env') })

/**
 * Global setup for Playwright E2E tests
 * Fetches OAuth2/JWT token before running tests
 *
 * Environment Variables (E2E Tests):
 * - ENVIRONMENT: 'local' (Kong) or 'DEV' (Keycloak) - defaults to 'local' (from root .env)
 * - E2E_TEST_TOKEN_URL: Full token endpoint URL (overrides default based on ENVIRONMENT)
 * - E2E_TEST_CLIENT_ID: OAuth2 client ID (required)
 * - E2E_TEST_CLIENT_SECRET: OAuth2 client secret (required)
 * - E2E_TEST_KEYCLOAK_REALM: Keycloak realm for DEV environment (defaults to 'apigw')
 * - VITE_API_GATEWAY_NOTIFY_URL: API Gateway URL (defaults to 'http://localhost:8000' for local)
 */
async function globalSetup(_config: FullConfig) {
  const environment = process.env.ENVIRONMENT || 'local'
  const clientId = process.env.E2E_TEST_CLIENT_ID
  const clientSecret = process.env.E2E_TEST_CLIENT_SECRET
  // For local testing, use backend directly; for remote, would use gateway
  const backendUrl =
    environment === 'DEV' ? 'https://coco-notify-gateway.dev.api.gov.ca' : 'http://localhost:3000'

  let tokenUrl = process.env.E2E_TEST_TOKEN_URL

  // Determine token URL based on environment if not explicitly set
  if (!tokenUrl) {
    if (environment === 'DEV') {
      const keycloakRealm = process.env.E2E_TEST_KEYCLOAK_REALM || 'apigw'
      const keycloakUrl =
        process.env.E2E_TEST_KEYCLOAK_URL || 'https://dev.loginproxy.gov.bc.ca/auth'
      tokenUrl = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`
    } else {
      // local environment - Kong
      const kongUrl = process.env.E2E_TEST_KONG_URL || 'http://localhost:8000'
      tokenUrl = `${kongUrl}/oauth2/token`
    }
  }

  console.log(`🔐 Fetching OAuth2 token...`)
  console.log(`   Environment: ${environment}`)
  console.log(`   Token URL: ${tokenUrl}`)
  console.log(`   Backend URL: ${backendUrl}`)

  // Validate required environment variables
  if (!clientId) {
    throw new Error('E2E_TEST_CLIENT_ID environment variable is required')
  }
  if (!clientSecret) {
    throw new Error('E2E_TEST_CLIENT_SECRET environment variable is required')
  }

  try {
    // Construct form data
    const formData = new URLSearchParams()
    formData.append('grant_type', 'client_credentials')
    formData.append('client_id', clientId)
    formData.append('client_secret', clientSecret)

    // Add scope for Kong environments
    if (environment === 'local') {
      formData.append('scope', 'notify')
    }

    // Fetch token with timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(
          `Failed to fetch token: ${tokenResponse.status} ${tokenResponse.statusText}\n${errorText}`,
        )
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string
        expires_in?: number
      }
      const accessToken = tokenData.access_token
      const expiresIn = tokenData.expires_in || 3600

      if (!accessToken) {
        throw new Error('No access_token in response')
      }

      // Store token in environment for tests to access
      process.env.E2E_TEST_AUTH_TOKEN = accessToken
      process.env.E2E_TEST_TOKEN_EXPIRES_IN = String(expiresIn)

      // Also save token to a file so test workers can access it
      // (process.env changes in globalSetup don't persist to test workers)
      const tokenFile = join(__dirname, '.playwright-token')
      writeFileSync(tokenFile, JSON.stringify({ accessToken, expiresIn }), 'utf-8')

      console.log(` Token fetched successfully`)
      console.log(`   Token expires in: ${expiresIn}s`)
      console.log(`   Token (first 20 chars): ${accessToken.substring(0, 20)}...`)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`Token fetch timeout: exceeded 30 second limit`)
      }
      throw fetchError
    }
  } catch (error) {
    console.error('❌ Failed to fetch token:', error)
    throw error
  }
}

export default globalSetup
