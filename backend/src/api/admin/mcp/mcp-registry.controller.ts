import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { Request } from 'express'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import { McpRegistryService } from './mcp-registry.service'
import { SaveMcpServerDto } from './mcp-registry.dto'

@ApiExcludeController()
@Controller({ path: 'frontend/admin/mcp-servers', version: '1' })
@UseGuards(NotifyAdminGuard)
@Roles(SsoRole.NOTIFY_ADMIN)
export class McpRegistryController {
  constructor(private readonly registry: McpRegistryService) {}

  @Get()
  list() {
    return this.registry.list()
  }

  @Post(':name')
  save(
    @Param('name') name: string,
    @Body() input: SaveMcpServerDto,
    @Req() request: Request & { user?: { sub?: string } },
  ) {
    return this.registry.save(name, input, request.user?.sub ?? 'unknown')
  }
}
