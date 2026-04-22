import { test, expect, request } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * E2E Tests for Notify API using Playwright
 *
 * These tests validate the Notify API endpoints end-to-end.
 * Run with: npx playwright test
 *
 * Prerequisites:
 * - Backend must be running
 * - Valid JWT token fetched by global-setup.ts
 * - Environment variables:
 *   - ENVIRONMENT: 'local' or 'DEV' (from root .env)
 *   - E2E_TEST_API_BASE_URL: API base URL (defaults based on ENVIRONMENT)
 *   - E2E_TEST_CLIENT_ID: OAuth2 client ID
 *   - E2E_TEST_CLIENT_SECRET: OAuth2 client secret
 */

// For local testing, use backend directly (localhost:3000)
// For remote testing (DEV/PROD), use API Gateway URL
const BACKEND_URL = 'http://localhost:3000'
const API_BASE_URL = `${BACKEND_URL}/api`
const API_VERSION = 'v1'

// Token is fetched by global-setup.ts and stored in process.env.E2E_TEST_AUTH_TOKEN
let JWT_TOKEN = ''

test.beforeAll(() => {
  // Try to read token from file first (set by global-setup.ts)
  // This is needed because process.env changes in globalSetup don't persist to test workers
  try {
    const tokenFile = join(__dirname, '.playwright-token')
    const tokenData = JSON.parse(readFileSync(tokenFile, 'utf-8')) as {
      accessToken: string
      expiresIn: number
    }
    JWT_TOKEN = tokenData.accessToken
    console.log(' Loaded token from file')
  } catch {
    // Fallback to environment variable if file doesn't exist
    JWT_TOKEN = process.env.E2E_TEST_AUTH_TOKEN || ''
    console.warn(' Could not read token file, falling back to E2E_TEST_AUTH_TOKEN')
  }

  if (!JWT_TOKEN) {
    console.warn('JWT_TOKEN not available in tests.')
    console.warn('Ensure global-setup.ts completed successfully.')
    console.warn('Set credentials and retry: CLIENT_ID, CLIENT_SECRET')
  } else {
    console.log('Using authenticated token (first 20 chars): ' + JWT_TOKEN.substring(0, 20) + '...')
  }
})

test.describe('Notify API E2E Tests', () => {
  test.describe('SimpleSend Endpoint', () => {
    test('should send email via simplesend endpoint with authentication', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const fullUrl = `${API_BASE_URL}/${API_VERSION}/notifysimple`

      const response = await context.post(fullUrl, {
        data: JSON.stringify({
          email: {
            to: ['test@example.com'],
            subject: 'Test Email Notification',
            body: 'This is a test email sent via notifysimple',
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      expect(response.status()).toBe(201)
      const body = await response.json()
      expect(body).toHaveProperty('txId')
      expect(body).toHaveProperty('messages')
      expect(Array.isArray(body.messages)).toBe(true)
      await context.dispose()
    })

    test('should require authentication for simplesend', async () => {
      const context = await request.newContext()

      const response = await context.post(`${API_BASE_URL}/${API_VERSION}/notifysimple`, {
        data: JSON.stringify({
          email: {
            to: ['test@example.com'],
            subject: 'Test Email',
            body: 'This should fail without auth',
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      expect(response.status()).toBeGreaterThanOrEqual(400)
      await context.dispose()
    })

    test('should accept POST request to simplesend with email payload', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.post(`${API_BASE_URL}/${API_VERSION}/notifysimple`, {
        data: JSON.stringify({
          email: {
            to: ['recipient@example.com'],
            subject: 'Welcome Email',
            body: 'Welcome to our service!',
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      expect(response.status()).toBe(201)
      const body = await response.json()
      expect(body).toHaveProperty('txId')
      expect(body).toHaveProperty('messages')
      await context.dispose()
    })
  })

  test.describe('NotifyEvent Endpoint', () => {
    test('should return error for notifyevent POST without auth', async () => {
      const context = await request.newContext()

      const response = await context.post(`${API_BASE_URL}/${API_VERSION}/notifyevent`, {
        data: JSON.stringify({
          eventType: 'test-event',
          recipients: ['test@example.com'],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      expect(response.status()).toBeGreaterThanOrEqual(400)
      await context.dispose()
    })

    test('should handle notifyevent preview endpoint', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.post(`${API_BASE_URL}/${API_VERSION}/notifyevent/preview`, {
        data: JSON.stringify({
          eventType: 'test-event',
          data: { name: 'John Doe' },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      expect(response.status()).toBe(501)
      await context.dispose()
    })

    test('should list event types', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notifyevent/types`)

      expect(response.status()).toBe(501)
      await context.dispose()
    })

    test('should get specific event type', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(
        `${API_BASE_URL}/${API_VERSION}/notifyevent/types/event-type-123`,
      )

      expect(response.status()).toBe(501)
      await context.dispose()
    })
  })

  test.describe('Notify Endpoint', () => {
    test('should list notifications', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notify`)

      expect(response.status()).toBe(501)
      await context.dispose()
    })

    test('should get notification status', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notify/status/test-id-123`)

      expect(response.status()).toBe(501)
      await context.dispose()
    })

    test('should register callback', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.post(
        `${API_BASE_URL}/${API_VERSION}/notify/registerCallback`,
        {
          data: JSON.stringify({
            url: 'https://example.com/callback',
            events: ['sent', 'bounced'],
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )

      expect(response.status()).toBe(501)
      await context.dispose()
    })
  })

  test.describe('Templates Endpoint', () => {
    test('should list templates', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/templates`)

      expect(response.status()).toBe(501)
      await context.dispose()
    })

    test('should get specific template', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/templates/template-123`)

      expect(response.status()).toBe(501)
      await context.dispose()
    })
  })

  test.describe('CHES Email Endpoint', () => {
    test('should send via CHES email', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      // CHES endpoint is at /ches/api/v1/email (global prefix /api is applied by backend)
      const response = await context.post(`http://localhost:3000/api/ches/api/v1/email`, {
        data: JSON.stringify({
          to: ['test@example.com'],
          subject: 'CHES Test Email',
          body: 'Test email via CHES',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // CHES endpoint is not yet fully implemented, just checking response
      expect([404, 501]).toContain(response.status())
      await context.dispose()
    })
  })

  test.describe('API Health', () => {
    test('should check API health', async () => {
      const context = await request.newContext()

      const response = await context.get(`${BACKEND_URL}/health`)

      expect([200, 304]).toContain(response.status())
      await context.dispose()
    })

    test('should check metrics endpoint', async () => {
      const context = await request.newContext()

      const response = await context.get(`${BACKEND_URL}/metrics`)

      expect([200, 304]).toContain(response.status())
      await context.dispose()
    })
  })
})
