import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateMcpServerDto } from './dto/create-mcp-server.dto';
import { UpdateEnabledToolsDto } from './dto/update-enabled-tools.dto';
import { McpServersService, McpServerSummary } from './mcp-servers.service';

@Controller('mcp-servers')
export class McpServersController {
  constructor(private readonly service: McpServersService) {}

  @Get()
  list(): Promise<McpServerSummary[]> {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<McpServerSummary> {
    return this.service.getSummary(id);
  }

  @Post()
  create(@Body() dto: CreateMcpServerDto): Promise<McpServerSummary> {
    return this.service.create(dto);
  }

  @Patch(':id/enabled-tools')
  updateEnabledTools(
    @Param('id') id: string,
    @Body() dto: UpdateEnabledToolsDto,
  ): Promise<McpServerSummary> {
    return this.service.updateEnabledTools(id, dto);
  }
}
