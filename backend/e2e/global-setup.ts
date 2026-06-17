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
    const fetchToken = async (activeClientId: string, activeClientSecret: string) => {
      const formData = new URLSearchParams()
      formData.append('grant_type', 'client_credentials')
      formData.append('client_id', activeClientId)
      formData.append('client_secret', activeClientSecret)

      if (environment === 'local') {
        formData.append('scope', 'notify')
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

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

        return {
          accessToken: tokenData.access_token,
          expiresIn: tokenData.expires_in || 3600,
          usedClientId: activeClientId,
        }
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(`Token fetch timeout: exceeded 30 second limit`)
        }
        throw fetchError
      }
    }

    let tokenResult = await fetchToken(clientId, clientSecret)

    if (!tokenResult.accessToken) {
      throw new Error('No access_token in response')
    }

    if (
      environment === 'local' &&
      tokenResult.usedClientId !== clientId &&
      tokenResult.usedClientId !== process.env.E2E_TEST_CLIENT_ID
    ) {
      console.log(`   Using fallback local OAuth client: ${tokenResult.usedClientId}`)
    }

    process.env.E2E_TEST_AUTH_TOKEN = tokenResult.accessToken
    process.env.E2E_TEST_TOKEN_EXPIRES_IN = String(tokenResult.expiresIn)

    const tokenFile = join(__dirname, '.playwright-token')
    writeFileSync(
      tokenFile,
      JSON.stringify({ accessToken: tokenResult.accessToken, expiresIn: tokenResult.expiresIn }),
      'utf-8',
    )

    console.log(` Token fetched successfully`)
    console.log(`   Token expires in: ${tokenResult.expiresIn}s`)
    console.log(`   Token (first 20 chars): ${tokenResult.accessToken.substring(0, 20)}...`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (environment === 'local' && errorMessage.includes('invalid_client')) {
      const localFallbackClients = [
        {
          id: 'LOCAL001-ABC123',
          secret: 'LOCAL001-SECRET-ABC123XYZ789',
        },
        {
          id: 'LOCAL002-DEF456',
          secret: 'LOCAL002-SECRET-DEF456XYZ789',
        },
        {
          id: 'LOCAL003-GHI789',
          secret: 'LOCAL003-SECRET-GHI789XYZ789',
        },
      ]

      for (const fallback of localFallbackClients) {
        if (fallback.id === clientId && fallback.secret === clientSecret) {
          continue
        }

        try {
          console.warn(
            `⚠️  Primary local OAuth client was rejected, retrying with seeded client ${fallback.id}...`,
          )

          const formData = new URLSearchParams()
          formData.append('grant_type', 'client_credentials')
          formData.append('client_id', fallback.id)
          formData.append('client_secret', fallback.secret)
          formData.append('scope', 'notify')

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

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
            const fallbackErrorText = await tokenResponse.text()
            throw new Error(
              `Failed to fetch token: ${tokenResponse.status} ${tokenResponse.statusText}\n${fallbackErrorText}`,
            )
          }

          const tokenData = (await tokenResponse.json()) as {
            access_token: string
            expires_in?: number
          }

          if (!tokenData.access_token) {
            throw new Error('No access_token in response')
          }

          process.env.E2E_TEST_AUTH_TOKEN = tokenData.access_token
          process.env.E2E_TEST_TOKEN_EXPIRES_IN = String(tokenData.expires_in || 3600)

          const tokenFile = join(__dirname, '.playwright-token')
          writeFileSync(
            tokenFile,
            JSON.stringify({
              accessToken: tokenData.access_token,
              expiresIn: tokenData.expires_in || 3600,
            }),
            'utf-8',
          )

          console.log(` Token fetched successfully`)
          console.log(`   Using fallback local OAuth client: ${fallback.id}`)
          console.log(`   Token expires in: ${tokenData.expires_in || 3600}s`)
          console.log(`   Token (first 20 chars): ${tokenData.access_token.substring(0, 20)}...`)

          return
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)

          if (!fallbackMessage.includes('invalid_client')) {
            console.error('❌ Failed to fetch token with fallback client:', fallbackError)
            throw fallbackError
          }
        }
      }
    }

    console.error('❌ Failed to fetch token:', error)
    throw error
  }
}

export default globalSetup
