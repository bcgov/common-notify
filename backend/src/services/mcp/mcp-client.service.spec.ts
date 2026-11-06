import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    process.env.TEST_MCP_KEY = 'test-credential'
    query.mockResolvedValue([
      {
        url: 'https://adapter.example/mcp',
        protocol: 'streamable-http',
        credential_env: 'TEST_MCP_KEY',
        permitted_parameters: ['groupIds'],
      },
    ])
    mocks.callTool.mockResolvedValue({ structuredContent: { emails: ['a@example.com'] } })
  })
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
  it('blocks unknown arguments before connecting', async () => {
    await expect(
      service.call('cstar', 'get_recipients', 'tenant-a', { groupIds: [], tenantId: 'victim' }),
    ).rejects.toThrow('parameter is not permitted')
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
})
