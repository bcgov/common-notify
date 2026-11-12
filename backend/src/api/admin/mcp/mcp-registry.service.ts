import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { validateMcpRegistryPolicy } from '../../../services/mcp/mcp-client.service'
import { SaveMcpServerDto } from './mcp-registry.dto'

@Injectable()
export class McpRegistryService {
  private readonly logger = new Logger(McpRegistryService.name)
  constructor(private readonly database: DataSource) {}

  list() {
    return this.database
      .query(`SELECT s.name, s.url, s.protocol, s.credential_env AS "credentialEnv", s.enabled,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name', t.name, 'enabled', t.enabled,
        'permittedParameters', t.permitted_parameters) ORDER BY t.name)
        FROM notify.mcp_tool t WHERE t.server_name = s.name), '[]'::jsonb) AS tools
      FROM notify.mcp_server s ORDER BY s.name`)
  }

  async save(name: string, input: SaveMcpServerDto, actor: string) {
    if (!/^[a-z][a-z0-9_-]{0,99}$/.test(name))
      throw new BadRequestException('Invalid MCP server name')
    validateMcpRegistryPolicy({ url: input.url, credential_env: input.credentialEnv })
    if (new URL(input.url).username || new URL(input.url).password) {
      throw new BadRequestException('Use a credential reference, not credentials in the URL')
    }
    await this.database.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO notify.mcp_server (name, url, protocol, credential_env, enabled)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO UPDATE SET
        url = EXCLUDED.url, protocol = EXCLUDED.protocol, credential_env = EXCLUDED.credential_env,
        enabled = EXCLUDED.enabled`,
        [name, input.url, input.protocol, input.credentialEnv, input.enabled],
      )
      await manager.query('DELETE FROM notify.mcp_tool WHERE server_name = $1', [name])
      for (const tool of input.tools) {
        await manager.query(
          `INSERT INTO notify.mcp_tool (server_name, name, permitted_parameters, enabled)
          VALUES ($1, $2, $3::jsonb, $4)`,
          [name, tool.name, JSON.stringify(tool.permittedParameters), tool.enabled],
        )
      }
    })
    this.logger.log(`MCP registry updated: server=${name} actor=${actor}`)
    return { name }
  }
}
