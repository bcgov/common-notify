import { test, expect, request } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * E2E Tests for Notifications API using Playwright
 *
 * These tests validate the Notifications API endpoints end-to-end.
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
    console.warn('  Could not read token file, falling back to E2E_TEST_AUTH_TOKEN')
  }

  if (!JWT_TOKEN) {
    console.warn('  JWT_TOKEN not available in tests.')
    console.warn('    Ensure global-setup.ts completed successfully.')
    console.warn('    Set credentials and retry: CLIENT_ID, CLIENT_SECRET')
  } else {
    console.log(
      '  Using authenticated token (first 20 chars): ' + JWT_TOKEN.substring(0, 20) + '...',
    )
  }
})

test.describe('Notifications API E2E Tests', () => {
  test.describe('List Notifications Endpoint', () => {
    test('should require authentication to list notifications', async () => {
      const context = await request.newContext()

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notifications`)

      expect(response.status()).toBeGreaterThanOrEqual(400)
      await context.dispose()
    })

    test('should return 200 with authenticated request', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notifications`)

      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(Array.isArray(body)).toBe(true)
      await context.dispose()
    })

    test('should return an array of notification requests', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notifications`)

      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(Array.isArray(body)).toBe(true)

      // If notifications exist, verify the shape of each item
      if (body.length > 0) {
        const notification = body[0]
        expect(notification).toHaveProperty('id')
        expect(notification).toHaveProperty('tenantId')
        expect(notification).toHaveProperty('status')
        expect(notification).toHaveProperty('createdAt')
      }
      await context.dispose()
    })
  })

  test.describe('Get Notification by ID Endpoint', () => {
    test('should require authentication to get a notification by id', async () => {
      const context = await request.newContext()

      const response = await context.get(
        `${API_BASE_URL}/${API_VERSION}/notifications/f47ac10b-58cc-4372-a567-0e02b2c3d479`,
      )

      expect(response.status()).toBeGreaterThanOrEqual(400)
      await context.dispose()
    })

    test('should return 400 for a non-UUID id', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notifications/not-a-uuid`)

      expect(response.status()).toBe(400)
      await context.dispose()
    })

    test('should return 404 for a valid UUID that does not exist', async () => {
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(
        `${API_BASE_URL}/${API_VERSION}/notifications/f47ac10b-58cc-4372-a567-0e02b2c3d479`,
      )

      expect(response.status()).toBe(404)
      await context.dispose()
    })

    test('should return notification shape when found', async () => {
      // First fetch the list to get a real ID if any exist
      const listContext = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const listResponse = await listContext.get(`${API_BASE_URL}/${API_VERSION}/notifications`)
      const notifications = await listResponse.json()
      await listContext.dispose()

      // Only run this assertion if there are existing notifications
      if (!Array.isArray(notifications) || notifications.length === 0) {
        test.skip()
        return
      }

      const notifId = notifications[0].id as string
      const context = await request.newContext({
        extraHTTPHeaders: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      })

      const response = await context.get(`${API_BASE_URL}/${API_VERSION}/notifications/${notifId}`)

      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.id).toBe(notifId)
      expect(body).toHaveProperty('tenantId')
      expect(body).toHaveProperty('status')
      expect(body).toHaveProperty('createdAt')
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
  })
})
