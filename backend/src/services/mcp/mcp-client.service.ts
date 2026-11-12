import { BadGatewayException, ForbiddenException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { isIP } from 'node:net'

export function validateMcpRegistryPolicy(server: { url: string; credential_env: string }): URL {
  if (
    typeof server.credential_env !== 'string' ||
    !/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*_MCP_API_KEY$/.test(server.credential_env)
  ) {
    throw new ForbiddenException('MCP credential is not permitted')
  }
  let destination: URL
  try {
    destination = new URL(server.url)
  } catch {
    throw new ForbiddenException('MCP destination is not permitted')
  }
  const hostname = destination.hostname.toLowerCase()
  const allowedHosts = (process.env.MCP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  const internalHost =
    !hostname.includes('.') || hostname.endsWith('.svc') || hostname.endsWith('.svc.cluster.local')
  if (
    !hostname ||
    isIP(hostname.replace(/^\[|\]$/g, '')) !== 0 ||
    (hostname === 'localhost' && process.env.NODE_ENV === 'production') ||
    !(
      (internalHost && ['http:', 'https:'].includes(destination.protocol)) ||
      (allowedHosts.includes(hostname) && destination.protocol === 'https:')
    )
  ) {
    throw new ForbiddenException('MCP destination is not permitted')
  }
  return destination
}

@Injectable()
export class McpClientService {
  constructor(private readonly database: DataSource) {}

  async call(
    serverName: string,
    tool: string,
    tenantId: string,
    parameters: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [server] = await this.database.query(
      `SELECT s.url, s.protocol, s.credential_env, t.permitted_parameters
       FROM notify.mcp_server s JOIN notify.mcp_tool t ON t.server_name = s.name
       WHERE s.name = $1 AND t.name = $2 AND s.enabled AND t.enabled`,
      [serverName, tool],
    )
    if (!server || server.protocol !== 'streamable-http')
      throw new ForbiddenException('MCP tool is not enabled')
    if (!tenantId || !/^[A-Za-z0-9_-]{1,128}$/.test(tenantId))
      throw new ForbiddenException('Invalid tenant context')
    if (
      !Array.isArray(server.permitted_parameters) ||
      Object.keys(parameters).some((key) => !server.permitted_parameters.includes(key))
    ) {
      throw new ForbiddenException('MCP parameter is not permitted')
    }
    const destination = validateMcpRegistryPolicy(server)
    const credential = process.env[server.credential_env]
    if (!credential) throw new BadGatewayException('MCP credentials are not configured')
    const client = new Client({ name: 'notify', version: '1.0.0' })
    const deadline = AbortSignal.timeout(15000)
    const transport = new StreamableHTTPClientTransport(destination, {
      requestInit: {
        headers: { Authorization: `Bearer ${credential}`, 'x-tenant-id': tenantId },
        signal: deadline,
        redirect: 'error',
      },
    })
    try {
      await client.connect(transport)
      const response = await client.callTool({ name: tool, arguments: parameters }, undefined, {
        timeout: 15000,
        signal: deadline,
      })
      if (response.isError) throw new Error('MCP tool failed')
      if (
        response.structuredContent &&
        typeof response.structuredContent === 'object' &&
        !Array.isArray(response.structuredContent)
      ) {
        return response.structuredContent as Record<string, unknown>
      }
      const content = response.content as Array<{ type: string; text?: string }>
      const text = content?.find((item) => item.type === 'text')?.text
      if (!text) throw new Error('Missing MCP result')
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Invalid MCP result')
      return parsed as Record<string, unknown>
    } catch {
      throw new BadGatewayException('MCP lookup failed')
    } finally {
      await Promise.allSettled([client.close(), transport.close()])
    }
  }
}
