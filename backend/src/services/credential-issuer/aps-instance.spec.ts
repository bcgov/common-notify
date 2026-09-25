import { describe, it, expect } from 'vitest'
import { classifyApsHost, describeApsInstanceMismatch } from './aps-instance'

const MOCK_TOKEN = 'http://oauth2-mock:3002/'
const MOCK_API = 'http://oauth2-mock:3002/ds/api/v3'
const TEST_TOKEN =
  'https://authz-apps-gov-bc-ca.test.api.gov.bc.ca/auth/realms/aps/protocol/openid-connect/token'
const TEST_API = 'https://api-gov-bc-ca.test.api.gov.bc.ca/ds/api/v3'
const PROD_TOKEN = 'https://authz.apps.gov.bc.ca/auth/realms/aps/protocol/openid-connect/token'
const PROD_API = 'https://api.gov.bc.ca/ds/api/v3'

describe('classifyApsHost', () => {
  it('recognises the deployments we actually use', () => {
    expect(classifyApsHost(MOCK_TOKEN)).toBe('local-mock')
    expect(classifyApsHost(MOCK_API)).toBe('local-mock')
    expect(classifyApsHost('http://localhost:3002/')).toBe('local-mock')
    expect(classifyApsHost(TEST_TOKEN)).toBe('aps-test')
    expect(classifyApsHost(TEST_API)).toBe('aps-test')
    expect(classifyApsHost(PROD_TOKEN)).toBe('aps-prod')
    expect(classifyApsHost(PROD_API)).toBe('aps-prod')
  })

  it('does not guess at hosts it has not been taught', () => {
    expect(classifyApsHost('https://something.else.gov.bc.ca/ds/api/v3')).toBe('unknown')
    expect(classifyApsHost('not a url')).toBe('unknown')
    expect(classifyApsHost(undefined)).toBe('unknown')
  })
})

describe('describeApsInstanceMismatch', () => {
  it('stays quiet when both point at the same deployment', () => {
    expect(describeApsInstanceMismatch(MOCK_TOKEN, MOCK_API)).toBeNull()
    expect(describeApsInstanceMismatch(TEST_TOKEN, TEST_API)).toBeNull()
    expect(describeApsInstanceMismatch(PROD_TOKEN, PROD_API)).toBeNull()
  })

  it('catches a mock token pointed at a real Directory API', () => {
    // Half-cleared .env: token URL blanked back to the mock default while the base URL
    // still names a real instance. Fails as a 401 that reads like a permissions problem.
    const warning = describeApsInstanceMismatch(MOCK_TOKEN, TEST_API)

    expect(warning).toMatch(/local mock/)
    expect(warning).toMatch(/APS test instance/)
  })

  it('catches a production service account pointed at the test Directory API', () => {
    const warning = describeApsInstanceMismatch(PROD_TOKEN, TEST_API)

    expect(warning).toMatch(/production instance/)
    expect(warning).toMatch(/test instance/)
  })

  it('names both variables so the reader knows what to change', () => {
    const warning = describeApsInstanceMismatch(PROD_TOKEN, MOCK_API)

    expect(warning).toMatch(/APS_TOKEN_URL/)
    expect(warning).toMatch(/APS_API_BASE_URL/)
  })

  it('says nothing when either side is unrecognised, rather than crying wolf', () => {
    expect(describeApsInstanceMismatch(PROD_TOKEN, 'https://some.new.host/ds/api/v3')).toBeNull()
    expect(describeApsInstanceMismatch(undefined, PROD_API)).toBeNull()
    expect(describeApsInstanceMismatch(undefined, undefined)).toBeNull()
  })
})
