import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { McpClientService } from './mcp-client.service'
import { McpGroupsService } from './mcp-groups.service'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
  transportClose: vi.fn(),
  options: vi.fn(),
}))
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = mocks.connect
    callTool = mocks.callTool
    close = mocks.close
  },
}))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    constructor(url: URL, options: unknown) {
      mocks.options(url, options)
    }
    close = mocks.transportClose
  },
}))

describe('stored MCP server policy', () => {
  const query = vi.fn()
  const service = new McpClientService({ query } as unknown as DataSource)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CSTAR_MCP_API_KEY', 'test-credential')
    vi.stubEnv('CSTAR_MCP_URL', '')
    vi.stubEnv('FOO_MCP_API_KEY', 'test-credential')
    vi.stubEnv('MCP_ALLOWED_HOSTS', '')
    vi.stubEnv('NODE_ENV', 'test')
    query.mockResolvedValue([
      {
        url: 'http://cstar-mcp:3101/mcp',
        protocol: 'streamable-http',
        credential_env: 'CSTAR_MCP_API_KEY',
        permitted_parameters: ['groupIds'],
      },
    ])
    mocks.callTool.mockResolvedValue({ structuredContent: { emails: ['a@example.com'] } })
  })
  afterEach(() => vi.unstubAllEnvs())

  function registryRow(overrides: Record<string, unknown>) {
    query.mockResolvedValue([
      {
        url: 'http://cstar-mcp:3101/mcp',
        protocol: 'streamable-http',
        credential_env: 'CSTAR_MCP_API_KEY',
        permitted_parameters: ['groupIds'],
        ...overrides,
      },
    ])
  }

  it.each(['CSTAR_MCP_API_KEY', 'FOO_MCP_API_KEY'])(
    'accepts credential name %s',
    async (credential_env) => {
      registryRow({ credential_env })
      await service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [] })
      expect(mocks.connect).toHaveBeenCalledOnce()
    },
  )

  it.each(['DATABASE_PASSWORD', 'JWT_SECRET', 'cstar_mcp_api_key', 'MCP_API_KEY'])(
    'rejects %s before reading any environment variable or connecting',
    async (credential_env) => {
      registryRow({ credential_env })
      const descriptor = Object.getOwnPropertyDescriptor(process, 'env')!
      const environment = process.env
      const readEnvironment = vi.fn(() => environment)
      let rejection: unknown
      Object.defineProperty(process, 'env', { configurable: true, get: readEnvironment })
      try {
        await service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [] })
      } catch (error) {
        rejection = error
      } finally {
        Object.defineProperty(process, 'env', descriptor)
      }
      expect(rejection).toBeInstanceOf(ForbiddenException)
      expect((rejection as Error).message).toBe('MCP credential is not permitted')
      expect(readEnvironment).not.toHaveBeenCalled()
      expect(mocks.options).not.toHaveBeenCalled()
      expect(mocks.connect).not.toHaveBeenCalled()
      expect(mocks.callTool).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['http://cstar-mcp/mcp', '', 'test', true],
    ['https://cstar-mcp/mcp', '', 'production', true],
    ['http://x.svc/mcp', '', 'test', true],
    ['https://x.svc.cluster.local/mcp', '', 'test', true],
    ['https://example.com/mcp', '', 'test', false],
    ['https://example.com/mcp', ' other.example, EXAMPLE.COM , ', 'test', true],
    ['http://example.com/mcp', 'example.com', 'test', false],
    ['http://169.254.169.254/mcp', '', 'test', false],
    ['https://10.0.0.5/mcp', '10.0.0.5', 'test', false],
    ['http://[::1]/mcp', '', 'test', false],
    ['https://[::1]/mcp', '[::1]', 'test', false],
    ['http://localhost/mcp', '', 'test', true],
    ['https://localhost/mcp', 'localhost', 'production', false],
    ['ftp://cstar-mcp/mcp', '', 'test', false],
    ['not a URL', '', 'test', false],
    ['http://0x7f000001/mcp', '', 'test', false],
    ['https://notexample.com/mcp', 'example.com', 'test', false],
  ])(
    'applies destination policy to %s (allowlist=%s, environment=%s)',
    async (url, hosts, environment, permitted) => {
      vi.stubEnv('MCP_ALLOWED_HOSTS', hosts)
      vi.stubEnv('NODE_ENV', environment)
      registryRow({ url })
      const request = service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [] })
      if (permitted) {
        await expect(request).resolves.toEqual({ emails: ['a@example.com'] })
        expect(mocks.connect).toHaveBeenCalledOnce()
      } else {
        await expect(request).rejects.toThrow(
          new ForbiddenException('MCP destination is not permitted'),
        )
        expect(mocks.options).not.toHaveBeenCalled()
        expect(mocks.connect).not.toHaveBeenCalled()
        expect(mocks.callTool).not.toHaveBeenCalled()
      }
    },
  )
  it('uses stored destination and credentials, with tenant identity separate from tool arguments', async () => {
    await expect(
      service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: ['group-a'] }),
    ).resolves.toEqual({ emails: ['a@example.com'] })
    expect(query.mock.calls[0][1]).toEqual(['cstar', 'get_recipients'])
    expect(mocks.options.mock.calls[0][1].requestInit.headers).toEqual({
      Authorization: 'Bearer test-credential',
      'x-tenant-id': 'tenant-a',
    })
    expect(mocks.callTool.mock.calls[0][0]).toEqual({
      name: 'get_recipients',
      arguments: { groupIds: ['group-a'] },
    })
    expect(mocks.close).toHaveBeenCalled()
    expect(mocks.transportClose).toHaveBeenCalled()
  })
  it('routes the seeded destination to the current release without overriding custom destinations', async () => {
    vi.stubEnv('CSTAR_MCP_URL', 'http://notify-337-cstar-mcp:3101/mcp')
    await service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [] })
    expect(mocks.options.mock.calls[0][0].href).toBe('http://notify-337-cstar-mcp:3101/mcp')
    registryRow({ url: 'http://custom-cstar:3101/mcp' })
    await service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [] })
    expect(mocks.options.mock.calls[1][0].href).toBe('http://custom-cstar:3101/mcp')
    registryRow({ url: 'https://cstar-mcp:3101/mcp' })
    await service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [] })
    expect(mocks.options.mock.calls[2][0].href).toBe('https://cstar-mcp:3101/mcp')
  })

  it('blocks unknown arguments before connecting', async () => {
    await expect(
      service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [], tenantId: 'victim' }),
    ).rejects.toThrow('parameter is not permitted')
    expect(mocks.connect).not.toHaveBeenCalled()
  })
  it('requires every group tool to be enabled before offering CSTAR recipients', async () => {
    query.mockResolvedValue([{ name: 'list_groups' }])
    await expect(service.areToolsEnabled('cstar', ['list_groups', 'get_recipients'])).resolves.toBe(
      false,
    )
    query.mockResolvedValue([{ name: 'list_groups' }, { name: 'get_recipients' }])
    await expect(service.areToolsEnabled('cstar', ['list_groups', 'get_recipients'])).resolves.toBe(
      true,
    )
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it('blocks disabled or unregistered tools', async () => {
    query.mockResolvedValue([])
    await expect(service.call('cstar', 'unregistered', 'tenant-a', {})).rejects.toThrow(
      'not enabled',
    )
    expect(mocks.connect).not.toHaveBeenCalled()
  })
  it('propagates tool failure instead of returning an empty recipient list', async () => {
    mocks.callTool.mockResolvedValue({ isError: true, content: [] })
    await expect(
      service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: ['group-a'] }),
    ).rejects.toThrow('MCP lookup failed')
    expect(mocks.close).toHaveBeenCalled()
  })
  it('rejects malformed recipient responses', async () => {
    mocks.callTool.mockResolvedValue({ structuredContent: { emails: [null] } })
    await expect(
      new McpGroupsService(service).getGroupMemberEmails('tenant-a', ['group-a']),
    ).rejects.toThrow('Invalid MCP recipients response')
  })
  it.each(['', 'tenant/escape', 'x'.repeat(129)])(
    'rejects invalid tenant context %s',
    async (tenant) => {
      await expect(service.call('cstar', 'get_recipients', tenant, {})).rejects.toThrow(
        'Invalid tenant context',
      )
      expect(mocks.connect).not.toHaveBeenCalled()
    },
  )
  it('rejects an unsupported transport', async () => {
    registryRow({ protocol: 'stdio' })
    await expect(service.call('cstar', 'get_recipients', 'tenant-a', {})).rejects.toThrow(
      'not enabled',
    )
  })
  it('rejects malformed argument policies', async () => {
    registryRow({ permitted_parameters: null })
    await expect(service.call('cstar', 'get_recipients', 'tenant-a', {})).rejects.toThrow(
      'parameter is not permitted',
    )
  })
  it('reports missing credentials before connecting', async () => {
    vi.stubEnv('CSTAR_MCP_API_KEY', '')
    await expect(service.call('cstar', 'get_recipients', 'tenant-a', {})).rejects.toThrow(
      'credentials are not configured',
    )
    expect(mocks.connect).not.toHaveBeenCalled()
  })
  it('uses HTTPS for the production release and rejects an insecure custom destination', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CSTAR_MCP_URL', 'https://notify-337-cstar-mcp.ns.svc:3101/mcp')
    await service.call('cstar', 'get_recipients', 'tenant-a', {})
    expect(mocks.options.mock.calls[0][0].protocol).toBe('https:')
    registryRow({ url: 'http://custom-cstar:3101/mcp' })
    await expect(service.call('cstar', 'get_recipients', 'tenant-a', {})).rejects.toThrow(
      'must use HTTPS',
    )
  })
  it('accepts JSON text results from compatible servers', async () => {
    mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: '{"emails":[]}' }] })
    await expect(service.call('cstar', 'get_recipients', 'tenant-a', {})).resolves.toEqual({
      emails: [],
    })
  })
  it.each([
    {},
    { content: [] },
    { content: [{ type: 'text', text: 'oops' }] },
    { content: [{ type: 'text', text: '[]' }] },
    { content: [{ type: 'text', text: 'null' }] },
  ])('rejects unusable MCP results %j', async (result) => {
    mocks.callTool.mockResolvedValue(result)
    await expect(service.call('cstar', 'get_recipients', 'tenant-a', {})).rejects.toThrow(
      'MCP lookup failed',
    )
    expect(mocks.close).toHaveBeenCalled()
  })
  it('cleans up even when connection or cleanup fails', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('Connection refused'))
    mocks.close.mockRejectedValueOnce(new Error('Already closed'))
    await expect(service.call('cstar', 'get_recipients', 'tenant-a', {})).rejects.toThrow(
      'MCP lookup failed',
    )
    expect(mocks.transportClose).toHaveBeenCalled()
  })
})
