import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { McpClientService } from './mcp-client.service'

@Injectable()
export class McpGroupsService {
  private readonly logger = new Logger(McpGroupsService.name)

  constructor(private readonly client: McpClientService) {}

  isEnabled() {
    return this.client.areToolsEnabled('cstar', ['list_groups', 'get_recipients'])
  }

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
      result.emails.some((email) => typeof email !== 'string' || !email.trim()) ||
      (result.missingGroupIds !== undefined &&
        (!Array.isArray(result.missingGroupIds) ||
          result.missingGroupIds.some((id) => typeof id !== 'string' || !id.trim())))
    ) {
      throw new BadGatewayException('Invalid MCP recipients response')
    }
    if (Array.isArray(result.missingGroupIds) && result.missingGroupIds.length) {
      this.logger.warn(
        `CSTAR groups missing for tenant ${tenantId}: ${result.missingGroupIds.join(', ')}`,
      )
    }
    return [...new Set((result.emails as string[]).map((email) => email.trim().toLowerCase()))]
  }
}
