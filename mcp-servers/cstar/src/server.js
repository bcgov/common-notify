import express from 'express'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { validateIdentifier } from './cstar.js'
import { createCstarClient } from './mock-cstar.js'

export function createApp(config = process.env, cstar = createCstarClient(config)) {
  if (!config.MCP_API_KEY || config.MCP_API_KEY.length < 32)
    throw new Error('MCP_API_KEY must have at least 32 characters')
  const app = express()
  app.get('/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/mcp', (req, res, next) => {
    const supplied = Buffer.from(req.get('authorization') ?? '')
    const expected = Buffer.from(`Bearer ${config.MCP_API_KEY}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return res.sendStatus(401)
    try {
      req.cstarTenantId = validateIdentifier(req.get('x-tenant-id'))
    } catch {
      return res.sendStatus(400)
    }
    next()
  })
  app.use(express.json({ limit: '1mb' }))
  app.post('/mcp', async (req, res) => {
    const server = new McpServer({ name: 'notify-cstar', version: '0.1.0' })
    const result = async (operation) => {
      try {
        const data = await operation()
        return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] }
      } catch {
        return { isError: true, content: [{ type: 'text', text: 'CSTAR lookup failed' }] }
      }
    }
    server.registerTool(
      'list_groups',
      {
        description: 'List groups belonging to the authenticated Notify tenant.',
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true },
      },
      () => result(() => cstar.listGroups(req.cstarTenantId)),
    )
    server.registerTool(
      'get_recipients',
      {
        description:
          'Return unique email addresses for groups owned by the authenticated Notify tenant.',
        inputSchema: z
          .object({ groupIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).max(100) })
          .strict(),
        annotations: { readOnlyHint: true },
      },
      ({ groupIds }) => result(() => cstar.getRecipients(req.cstarTenantId, groupIds)),
    )
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    res.on('close', () => {
      void Promise.allSettled([transport.close(), server.close()])
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch {
      if (!res.headersSent)
        res
          .status(500)
          .json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  })
  app.all('/mcp', (_req, res) => res.set('Allow', 'POST').sendStatus(405))
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const listener = createApp().listen(Number(process.env.PORT ?? 3101), '0.0.0.0')
  const shutdown = () => {
    listener.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 25000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
