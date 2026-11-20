import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createListener } from '../src/server.js'

const exec = promisify(execFile)
const healthcheck = fileURLToPath(new URL('../src/healthcheck.js', import.meta.url))
const key = 'test-mcp-transport-key-'.repeat(3)

async function listen(server, t) {
  server.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return String(server.address().port)
}

test('standalone HTTP supports the Docker healthcheck', async (t) => {
  const port = await listen(createListener({ MCP_API_KEY: key }, {}), t)
  await exec(process.execPath, [healthcheck], {
    env: { ...process.env, PORT: port, MCP_TLS_CERT_FILE: '' },
  })
})

test('incomplete TLS configuration fails instead of falling back to HTTP', () => {
  assert.throws(
    () => createListener({ MCP_API_KEY: key, MCP_TLS_CERT_FILE: 'cert' }, {}),
    /Both MCP TLS/,
  )
  assert.throws(
    () => createListener({ MCP_API_KEY: key, MCP_TLS_KEY_FILE: 'key' }, {}),
    /Both MCP TLS/,
  )
})

test('HTTPS validates the service identity and trusted CA, including the healthcheck', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'notify-mcp-tls-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const certificate = join(directory, 'tls.crt')
  const privateKey = join(directory, 'tls.key')
  const openssl =
    process.env.OPENSSL_BIN ||
    (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl')
  await exec(openssl, [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-keyout',
    privateKey,
    '-out',
    certificate,
    '-subj',
    '/CN=cstar-mcp.test',
    '-addext',
    'subjectAltName=DNS:cstar-mcp.test,IP:127.0.0.1',
  ])
  const config = {
    MCP_API_KEY: key,
    MCP_TLS_CERT_FILE: certificate,
    MCP_TLS_KEY_FILE: privateKey,
    MCP_TLS_CA_FILE: certificate,
    MCP_TLS_SERVER_NAME: 'cstar-mcp.test',
  }
  const port = await listen(
    createListener(config, {
      listGroups: async (tenant) => {
        assert.equal(tenant, 'tenant-a')
        return { groups: [{ id: 'group-a', name: 'Operations' }] }
      },
    }),
    t,
  )
  await exec(process.execPath, [healthcheck], { env: { ...process.env, ...config, PORT: port } })
  // Exercise the same SDK transport and CA trust used by Notify, beyond /health.
  const call = await exec(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { Client } from '@modelcontextprotocol/sdk/client/index.js'
    import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
    const client = new Client({ name: 'notify', version: '1.0.0' })
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(process.env.TEST_MCP_URL), {
        requestInit: { headers: { Authorization: 'Bearer ' + process.env.MCP_API_KEY, 'x-tenant-id': 'tenant-a' } },
      }))
      const result = await client.callTool({ name: 'list_groups', arguments: {} })
      console.log(JSON.stringify(result.structuredContent))
    } finally { await client.close() }
  `,
    ],
    {
      env: {
        ...process.env,
        ...config,
        NODE_EXTRA_CA_CERTS: certificate,
        TEST_MCP_URL: `https://127.0.0.1:${port}/mcp`,
      },
    },
  )
  assert.deepEqual(JSON.parse(call.stdout), { groups: [{ id: 'group-a', name: 'Operations' }] })
  await assert.rejects(
    exec(process.execPath, [healthcheck], {
      env: { ...process.env, ...config, PORT: port, MCP_TLS_SERVER_NAME: 'wrong-service.test' },
    }),
  )
})
