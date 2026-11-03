import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpRecipientsService } from './mcp-recipients.service'

export function buildMcpServer(tenantId: string, recipients: McpRecipientsService): McpServer {
  const server = new McpServer({ name: 'bc-notify', version: '0.1.0' })
  server.registerTool('ping', { inputSchema: {}, annotations: { readOnlyHint: true } }, () => ({
    content: [{ type: 'text', text: 'pong' }],
  }))
  server.registerTool(
    'get_notification_recipients',
    {
      inputSchema: {
        notificationId: z.string().uuid(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const result = await recipients.getNotificationRecipients(tenantId, input)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        let message: string
        if (error instanceof NotFoundException) {
          message = 'Notification not found'
        } else if (error instanceof BadRequestException) {
          message = 'Invalid request'
        } else if (error instanceof ForbiddenException) {
          message = 'Access denied'
        } else {
          message = 'Internal error'
          new Logger('McpServer').error('MCP recipient tool failed', error)
        }
        return { isError: true, content: [{ type: 'text', text: message }] }
      }
    },
  )
  return server
}
