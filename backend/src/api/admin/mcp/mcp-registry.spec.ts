import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { McpRegistryService } from './mcp-registry.service'
import { McpRegistryController } from './mcp-registry.controller'
import { SaveMcpServerDto } from './mcp-registry.dto'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { ROLES_KEY } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'

describe('MCP registry administration', () => {
  const query = vi.fn()
  const transaction = vi.fn(async (operation) => operation({ query }))
  const service = new McpRegistryService({ query, transaction } as unknown as DataSource)
  const input = (): SaveMcpServerDto => ({
    url: 'http://cstar-mcp:3101/mcp',
    protocol: 'streamable-http',
    credentialEnv: 'CSTAR_MCP_API_KEY',
    enabled: true,
    tools: [
      { name: 'list_groups', enabled: true, permittedParameters: [] },
      { name: 'get_recipients', enabled: true, permittedParameters: ['groupIds'] },
    ],
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MCP_ALLOWED_HOSTS', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('requires the existing admin guard and SSO admin role on all registry endpoints', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, McpRegistryController)).toContain(NotifyAdminGuard)
    expect(Reflect.getMetadata(ROLES_KEY, McpRegistryController)).toEqual([SsoRole.NOTIFY_ADMIN])
  })
  it('saves server and tool permissions atomically using only a credential reference', async () => {
    await expect(service.save('cstar', input(), 'admin-user')).resolves.toEqual({ name: 'cstar' })
    expect(transaction).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][1]).toEqual([
      'cstar',
      input().url,
      'streamable-http',
      'CSTAR_MCP_API_KEY',
      true,
    ])
    expect(query.mock.calls[3][1]).toEqual(['cstar', 'get_recipients', '["groupIds"]', true])
  })
  it.each([
    { credentialEnv: 'DATABASE_PASSWORD' },
    { url: 'http://169.254.169.254/mcp' },
    { url: 'https://unapproved.example/mcp' },
    { url: 'http://user:secret@cstar-mcp/mcp' },
  ])('rejects unsafe registry values before writing: %j', async (changes) => {
    await expect(service.save('cstar', { ...input(), ...changes }, 'admin')).rejects.toThrow()
    expect(transaction).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })
  it('rejects duplicate tools and arbitrary secret fields through DTO validation', async () => {
    const dto = plainToInstance(SaveMcpServerDto, {
      ...input(),
      secret: 'not-a-reference',
      tools: [input().tools[0], input().tools[0]],
    })
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['secret', 'tools']),
    )
  })
})
