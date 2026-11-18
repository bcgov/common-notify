import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyDev } from '../src/verify-dev.js'

const config = {
  CSTAR_API_URL: 'https://dev.connect.digital.gov.bc.ca',
  CSTAR_TOKEN_URL:
    'https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/token',
  CSTAR_CLIENT_ID: 'notify-cstar-integration-6738',
  CSTAR_CLIENT_SECRET: 'test-secret',
}

test('DEV check uses service-account token and returns counts without member data or credentials', async () => {
  const paths = []
  const result = await verifyDev(config, 'tenant-a', 'group-a', async (url, options) => {
    const path = new URL(url).pathname
    paths.push(path)
    if (path.endsWith('/token')) {
      assert.equal(options.body.get('client_id'), config.CSTAR_CLIENT_ID)
      return Response.json({ access_token: 'test-token', expires_in: 300 })
    }
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    if (path.endsWith('/groups'))
      return Response.json({ data: { groups: [{ id: 'group-a', name: 'A' }] } })
    return Response.json({ data: { users: [{ email: 'person@example.com' }] } })
  })
  assert.deepEqual(result, { environment: 'DEV', groupCount: 1, uniqueEmailCount: 1, passed: true })
  assert.ok(paths.includes('/api/v1/tenants/tenant-a/groups/group-a/users'))
})

test('DEV check blocks wrong environments, missing credentials and invalid IDs before fetch', async () => {
  let calls = 0
  const request = async () => {
    calls++
    throw new Error('Unexpected network call')
  }
  for (const changes of [
    { CSTAR_API_URL: 'https://test.connect.digital.gov.bc.ca' },
    {
      CSTAR_TOKEN_URL:
        'https://test.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/token',
    },
    { CSTAR_CLIENT_ID: 'another-account' },
    { CSTAR_CLIENT_SECRET: '' },
  ]) {
    await assert.rejects(verifyDev({ ...config, ...changes }, 'tenant-a', 'group-a', request))
  }
  await assert.rejects(verifyDev(config, '../tenant', 'group-a', request))
  assert.equal(calls, 0)
})
