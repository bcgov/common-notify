import { BadGatewayException, Injectable } from '@nestjs/common'
import { McpClientService } from './mcp-client.service'

@Injectable()
export class McpGroupsService {
  constructor(private readonly client: McpClientService) {}

  async getTenantGroups(tenantId: string) {
    const result = await this.client.call('cstar', 'list_groups', tenantId, {})
    const groups = result.groups
    if (
      !Array.isArray(groups) ||
      groups.some(
        (group) => !group || typeof group.id !== 'string' || typeof group.name !== 'string',
      )
    ) {
      throw new BadGatewayException('Invalid MCP groups response')
    }
    return groups as Array<{ id: string; name: string; description?: string }>
  }

  async getGroupMemberEmails(tenantId: string, groupIds: string[]): Promise<string[]> {
    if (!groupIds.length) return []
    const result = await this.client.call('cstar', 'get_recipients', tenantId, { groupIds })
    if (
      !Array.isArray(result.emails) ||
      result.emails.some((email) => typeof email !== 'string' || !email.trim())
    ) {
      throw new BadGatewayException('Invalid MCP recipients response')
    }
    return [...new Set((result.emails as string[]).map((email) => email.trim().toLowerCase()))]
  }
}
