import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMcpServer } from './mcp-server.factory'
import type { McpRecipientsService } from './mcp-recipients.service'

const notificationId = 'b0706af4-78eb-4aa3-a15c-174a8c5f5285'

describe('buildMcpServer', () => {
  let server: McpServer
  let client: Client
  const recipients = { getNotificationRecipients: vi.fn() }

  beforeEach(async () => {
    vi.resetAllMocks()
    server = buildMcpServer('internal-tenant', recipients as unknown as McpRecipientsService)
    client = new Client({ name: 'mcp-test', version: '0.1.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
  })

  afterEach(async () => {
    await client.close()
    await server.close()
    vi.restoreAllMocks()
  })

  it('lists exactly the two tools without tenant input and marks recipients read-only', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toStrictEqual([
      'get_notification_recipients',
      'ping',
    ])
    for (const tool of tools) {
      expect(JSON.stringify(tool.inputSchema)).not.toContain('tenantId')
    }
    expect(
      tools.find((tool) => tool.name === 'get_notification_recipients')?.annotations?.readOnlyHint,
    ).toBe(true)
  })

  it('returns pong', async () => {
    expect(await client.callTool({ name: 'ping', arguments: {} })).toStrictEqual({
      content: [{ type: 'text', text: 'pong' }],
    })
  })

  it('uses only the closed-over tenant and serializes the facade result', async () => {
    const result = {
      notificationId,
      recipients: [],
      total: 0,
      page: 2,
      pageSize: 10,
      totalPages: 0,
    }
    recipients.getNotificationRecipients.mockResolvedValue(result)
    const output = await client.callTool({
      name: 'get_notification_recipients',
      arguments: { notificationId, page: 2, pageSize: 10, tenantId: 'attacker-tenant' },
    })
    expect(recipients.getNotificationRecipients).toHaveBeenCalledExactlyOnceWith(
      'internal-tenant',
      { notificationId, page: 2, pageSize: 10 },
    )
    expect(output).toStrictEqual({ content: [{ type: 'text', text: JSON.stringify(result) }] })
  })

  it.each([
    [new NotFoundException('secret missing detail'), 'Notification not found'],
    [new BadRequestException('secret validation detail'), 'Invalid request'],
    [new ForbiddenException('secret tenant detail'), 'Access denied'],
  ])('sanitizes expected facade errors', async (error, message) => {
    recipients.getNotificationRecipients.mockRejectedValue(error)
    expect(
      await client.callTool({
        name: 'get_notification_recipients',
        arguments: { notificationId },
      }),
    ).toStrictEqual({ isError: true, content: [{ type: 'text', text: message }] })
  })

  it('logs unexpected errors without disclosing their details', async () => {
    const error = new Error('secret db detail')
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    recipients.getNotificationRecipients.mockRejectedValue(error)
    const output = await client.callTool({
      name: 'get_notification_recipients',
      arguments: { notificationId },
    })
    expect(output).toStrictEqual({
      isError: true,
      content: [{ type: 'text', text: 'Internal error' }],
    })
    expect(JSON.stringify(output)).not.toContain('secret db detail')
    expect(log).toHaveBeenCalledWith('MCP recipient tool failed', error)
  })

  it.each([
    { notificationId: 'invalid' },
    { notificationId, page: 0 },
    { notificationId, page: 1.5 },
    { notificationId, pageSize: 51 },
    { notificationId, pageSize: '10' },
  ])('rejects invalid tool input before calling the facade: %s', async (args) => {
    const output = await client.callTool({ name: 'get_notification_recipients', arguments: args })
    expect(output.isError).toBe(true)
    expect(recipients.getNotificationRecipients).not.toHaveBeenCalled()
  })
})
