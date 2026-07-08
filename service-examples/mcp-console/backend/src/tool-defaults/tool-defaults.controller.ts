import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SaveToolDefaultsDto } from './dto/save-tool-defaults.dto';
import { ToolDefaults, ToolDefaultsService } from './tool-defaults.service';

@Controller('mcp-servers/:id/tools/:toolName/defaults')
export class ToolDefaultsController {
  constructor(private readonly service: ToolDefaultsService) {}

  @Get()
  get(
    @Param('id') serverId: string,
    @Param('toolName') toolName: string,
    @Query('tenant') tenant?: string,
  ): Promise<ToolDefaults> {
    return this.service.getDefaults(serverId, toolName, tenant);
  }

  @Post()
  save(
    @Param('id') serverId: string,
    @Param('toolName') toolName: string,
    @Body() dto: SaveToolDefaultsDto,
  ): Promise<ToolDefaults> {
    return this.service.saveDefaults(serverId, toolName, dto);
  }
}
