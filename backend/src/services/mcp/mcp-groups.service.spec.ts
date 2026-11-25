import { describe, expect, it, vi } from 'vitest'
import { McpGroupsService } from './mcp-groups.service'
import { Logger } from '@nestjs/common'
import { McpClientService } from './mcp-client.service'

function setup() {
  const call = vi.fn()
  const areToolsEnabled = vi.fn().mockResolvedValue(true)
  const service = new McpGroupsService({ call, areToolsEnabled } as unknown as McpClientService)
  return { service, call, areToolsEnabled }
}

describe('CSTAR MCP result validation', () => {
  it('lists groups without changing the authenticated tenant context', async () => {
    const { service, call } = setup()
    call.mockResolvedValue({ groups: [{ id: 'a', name: 'Operations' }] })
    await expect(service.getTenantGroups('tenant-a')).resolves.toEqual([
      { id: 'a', name: 'Operations' },
    ])
    expect(call).toHaveBeenCalledWith('cstar', 'list_groups', 'tenant-a', {})
  })

  it.each([
    {},
    { groups: null },
    { groups: [null] },
    { groups: [{ id: 1, name: 'A' }] },
    { groups: [{ id: 'a' }] },
  ])('rejects malformed group data %j', async (result) => {
    const { service, call } = setup()
    call.mockResolvedValue(result)
    await expect(service.getTenantGroups('tenant-a')).rejects.toThrow('Invalid MCP groups response')
  })

  it('normalizes and deduplicates recipient emails', async () => {
    const { service, call } = setup()
    call.mockResolvedValue({ emails: [' A@example.com ', 'a@example.com', 'b@example.com'] })
    await expect(service.getGroupMemberEmails('tenant-a', ['a'])).resolves.toEqual([
      'a@example.com',
      'b@example.com',
    ])
  })

  it('warns about missing groups and returns the remaining recipients', async () => {
    const { service, call } = setup()
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    try {
      call.mockResolvedValue({ emails: ['a@example.com'], missingGroupIds: ['deleted'] })
      await expect(service.getGroupMemberEmails('tenant-a', ['a', 'deleted'])).resolves.toEqual([
        'a@example.com',
      ])
      expect(warn).toHaveBeenCalledWith('CSTAR groups missing for tenant tenant-a: deleted')
    } finally {
      warn.mockRestore()
    }
  })

  it('does not connect for an empty group selection', async () => {
    const { service, call } = setup()
    await expect(service.getGroupMemberEmails('tenant-a', [])).resolves.toEqual([])
    expect(call).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { emails: 'a@example.com' },
    { emails: [null] },
    { emails: [' '] },
    { emails: [], missingGroupIds: 'bad' },
    { emails: [], missingGroupIds: [null] },
  ])('rejects malformed recipient data %j', async (result) => {
    const { service, call } = setup()
    call.mockResolvedValue(result)
    await expect(service.getGroupMemberEmails('tenant-a', ['a'])).rejects.toThrow(
      'Invalid MCP recipients response',
    )
  })

  it('requires both CSTAR tools for group availability', async () => {
    const { service, areToolsEnabled } = setup()
    await expect(service.isEnabled()).resolves.toBe(true)
    expect(areToolsEnabled).toHaveBeenCalledWith('cstar', ['list_groups', 'get_recipients'])
  })
})
