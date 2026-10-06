import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * config.js prefers the values Caddy injects at runtime (window.VITE_*) over the
 * build-time ones, because the image is built once and configured per environment.
 *
 * These cover the CSTAR tenant setup link in particular: it differs between production
 * and everywhere else, and a wrong value sends a user with no tenancy to the wrong CSTAR
 * to create one.
 */
const TEST_INSTANCE = 'https://test.connect.digital.gov.bc.ca/'
const PROD_INSTANCE = 'https://connect.digital.gov.bc.ca/'

const injected = window as unknown as Record<string, unknown>

const loadConfig = async () => {
  vi.resetModules()
  return (await import('@/config')).default
}

describe('config.CSTAR_TENANT_SETUP_URL', () => {
  afterEach(() => {
    delete injected.VITE_CSTAR_TENANT_SETUP_URL
    vi.resetModules()
  })

  it('uses the value injected at runtime', async () => {
    injected.VITE_CSTAR_TENANT_SETUP_URL = PROD_INSTANCE

    const config = await loadConfig()

    expect(config.CSTAR_TENANT_SETUP_URL).toBe(PROD_INSTANCE)
  })

  it('falls back to the test instance when nothing is injected', async () => {
    const config = await loadConfig()

    expect(config.CSTAR_TENANT_SETUP_URL).toBe(TEST_INSTANCE)
  })

  // An unset variable reaches the browser as an empty string, which would otherwise
  // redirect to the current page instead of CSTAR.
  it('ignores an empty injected value', async () => {
    injected.VITE_CSTAR_TENANT_SETUP_URL = ''

    const config = await loadConfig()

    expect(config.CSTAR_TENANT_SETUP_URL).toBe(TEST_INSTANCE)
  })
})
