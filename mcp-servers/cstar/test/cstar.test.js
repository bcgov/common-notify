import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CstarClient } from '../src/cstar.js'
import { createApp } from '../src/server.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createCstarClient } from '../src/mock-cstar.js'

test('demo fixtures require development and explicit tenants, and isolate group ownership', async () => {
  assert.throws(
    () => createCstarClient({ CSTAR_MOCK_MODE: 'true', NODE_ENV: 'production' }),
    /development/,
  )
  assert.throws(
    () => createCstarClient({ CSTAR_MOCK_MODE: 'true', NODE_ENV: 'development' }),
    /TENANT_IDS/,
  )
  const client = createCstarClient({
    CSTAR_MOCK_MODE: 'true',
    NODE_ENV: 'development',
    CSTAR_MOCK_TENANT_IDS: 'tenant-a, tenant-b',
  })
  const { groups } = await client.listGroups('tenant-a')
  assert.equal(groups.length, 3)
  assert.deepEqual(
    await client.getRecipients(
      'tenant-a',
      groups.slice(0, 2).map((group) => group.id),
    ),
    {
      emails: ['alex@example.invalid', 'sam@example.invalid', 'jordan@example.invalid'],
    },
  )
  assert.deepEqual(await client.getRecipients('tenant-a', [groups[2].id]), { emails: [] })
  await assert.rejects(client.getRecipients('tenant-b', [groups[0].id]), /does not belong/)
  await assert.rejects(client.listGroups('unconfigured'), /not configured/)
})

test('service account resolves only tenant-owned groups and normalizes emails', async () => {
  const calls = []
  const client = new CstarClient(
    {
      CSTAR_API_URL: 'https://cstar.example',
      CSTAR_TOKEN_URL: 'https://sso.example/token',
      CSTAR_CLIENT_ID: 'service-account',
      CSTAR_CLIENT_SECRET: 'test-secret',
    },
    async (url, options) => {
      calls.push([String(url), options])
      if (String(url).endsWith('/token'))
        return Response.json({ access_token: 'service-token', expires_in: 300 })
      assert.equal(options.headers.Authorization, 'Bearer service-token')
      if (String(url).endsWith('/groups'))
        return Response.json({ data: { groups: [{ id: 'group-a', name: 'A' }] } })
      return Response.json({
        data: {
          users: [
            { ssoUser: { email: ' A@Example.com ' } },
            { ssoUser: { email: 'a@example.com' } },
            { ssoUser: null },
          ],
        },
      })
    },
  )
  assert.deepEqual(await client.getRecipients('tenant-a', ['group-a']), {
    emails: ['a@example.com'],
  })
  await assert.rejects(client.getRecipients('tenant-a', ['foreign-group']), /does not belong/)
  assert.equal(calls.filter(([url]) => url.includes('/users?')).length, 1)
  assert.equal(calls.filter(([url]) => url.endsWith('/token')).length, 1)
  await assert.rejects(client.listGroups('../escape'), /Invalid identifier/)
})

test('demo mode resolves fixture recipients over MCP HTTP without CSTAR credentials', async (t) => {
  const key = 'demo-key-'.repeat(8)
  const listener = createApp({
    MCP_API_KEY: key,
    NODE_ENV: 'development',
    CSTAR_MOCK_MODE: 'true',
    CSTAR_MOCK_TENANT_IDS: 'tenant-a',
  }).listen(0, '127.0.0.1')
  await new Promise((resolve) => listener.once('listening', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        listener.close(resolve)
        listener.closeAllConnections()
      }),
  )
  const client = new Client({ name: 'demo-test', version: '1' })
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${listener.address().port}/mcp`),
    {
      requestInit: { headers: { Authorization: `Bearer ${key}`, 'x-tenant-id': 'tenant-a' } },
    },
  )
  t.after(() => client.close())
  await client.connect(transport)
  const listed = await client.callTool({ name: 'list_groups', arguments: {} })
  assert.equal(listed.structuredContent.groups.length, 3)
  const result = await client.callTool({
    name: 'get_recipients',
    arguments: {
      groupIds: listed.structuredContent.groups.slice(0, 2).map((group) => group.id),
    },
  })
  assert.deepEqual(result.structuredContent, {
    emails: ['alex@example.invalid', 'sam@example.invalid', 'jordan@example.invalid'],
  })
})

test('HTTP MCP contract enforces credentials, tenant context and strict tool fields', async (t) => {
  const key = 'test-key-'.repeat(8)
  const received = []
  const app = createApp(
    { MCP_API_KEY: key },
    {
      listGroups: async (tenant) => {
        received.push(tenant)
        return { groups: [{ id: 'g', name: 'Group' }] }
      },
      getRecipients: async (tenant, ids) => {
        received.push([tenant, ids])
        return { emails: ['a@example.com'] }
      },
    },
  )
  const listener = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => listener.once('listening', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        listener.close(resolve)
        listener.closeAllConnections()
      }),
  )
  const url = new URL(`http://127.0.0.1:${listener.address().port}/mcp`)
  assert.equal((await fetch(url, { method: 'POST' })).status, 401)
  assert.equal(
    (await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}` } })).status,
    400,
  )
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${key}`,
        'x-tenant-id': 'tenant-a',
      },
    },
  })
  const client = new Client({ name: 'test', version: '1' })
  t.after(() => client.close())
  await client.connect(transport)
  const tools = await client.listTools()
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['get_recipients', 'list_groups'])
  assert.deepEqual(
    (await client.callTool({ name: 'list_groups', arguments: {} })).structuredContent,
    { groups: [{ id: 'g', name: 'Group' }] },
  )
  const rejected = await client.callTool({
    name: 'get_recipients',
    arguments: { groupIds: ['g'], tenantId: 'victim' },
  })
  assert.equal(rejected.isError, true)
  assert.deepEqual(received, ['tenant-a'])
  const result = await client.callTool({ name: 'get_recipients', arguments: { groupIds: ['g'] } })
  assert.deepEqual(result.structuredContent, { emails: ['a@example.com'] })
  assert.deepEqual(received.at(-1), ['tenant-a', ['g']])
})
