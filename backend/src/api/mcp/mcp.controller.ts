import { Controller, Delete, Get, Logger, Post, Req, Res, UseGuards, Version } from '@nestjs/common'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Request, Response } from 'express'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { McpRecipientsService } from './mcp-recipients.service'
import { buildMcpServer } from './mcp-server.factory'

@Controller('mcp')
@UseGuards(NotifyServiceGuard, FeatureFlagGuard)
@FeatureFlag(FeatureFlagCode.MCP_API)
export class McpController {
  constructor(private readonly recipients: McpRecipientsService) {}

  @Version('1')
  @Post()
  async post(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const tenant = (req as any).tenant as Tenant
      const server = buildMcpServer(tenant.id, this.recipients)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => {
        void Promise.allSettled([transport.close(), server.close()]).then((results) => {
          for (const result of results) {
            if (result.status === 'rejected') {
              new Logger(McpController.name).error('MCP cleanup failed', result.reason)
            }
          }
        })
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      new Logger(McpController.name).error('MCP request failed', error)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        })
      }
    }
  }

  @Version('1')
  @Get()
  get(@Res() res: Response): void {
    this.methodNotAllowed(res)
  }

  @Version('1')
  @Delete()
  delete(@Res() res: Response): void {
    this.methodNotAllowed(res)
  }

  private methodNotAllowed(res: Response): void {
    res.setHeader('Allow', 'POST')
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not allowed' },
      id: null,
    })
  }
}
