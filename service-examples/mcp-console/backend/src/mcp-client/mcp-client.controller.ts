import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { decrypt } from '../common/crypto.util';
import { McpServersService } from '../mcp-servers/mcp-servers.service';
import { DiscoverServerDto } from './dto/discover-server.dto';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { McpClientFactory, ToolCallResult, ToolInfo } from './mcp-client.factory';

@Controller('mcp-client')
export class McpClientController {
  constructor(
    private readonly factory: McpClientFactory,
    private readonly servers: McpServersService,
  ) {}

  /** Stateless pre-flight used by the "Add service" wizard — does not touch the DB. */
  @Post('discover')
  discover(@Body() dto: DiscoverServerDto): Promise<ToolInfo[]> {
    return this.factory.listTools(dto.url, dto.transport, dto.apiKey);
  }

  /** Live tools/list for an already-registered server, filtered to its enabled subset. */
  @Get(':id/tools')
  async tools(@Param('id') id: string): Promise<ToolInfo[]> {
    const entity = await this.servers.getEntity(id);
    const all = await this.factory.listTools(entity.url, entity.transport, decrypt(entity.apiKey));
    const enabled = new Set(entity.enabledTools);
    return all.filter((tool) => enabled.has(tool.name));
  }

  /**
   * Full, unfiltered tools/list for an already-registered server, using its stored credentials.
   * Used by the global admin's "edit enabled tools" UI — the browser never has the API key
   * itself, so it can't call the stateless /discover endpoint for an existing registration.
   */
  @Get(':id/all-tools')
  async allTools(@Param('id') id: string): Promise<ToolInfo[]> {
    const entity = await this.servers.getEntity(id);
    return this.factory.listTools(entity.url, entity.transport, decrypt(entity.apiKey));
  }

  @Post(':id/execute')
  async execute(@Param('id') id: string, @Body() dto: ExecuteToolDto): Promise<ToolCallResult> {
    const entity = await this.servers.getEntity(id);
    return this.factory.callTool(
      entity.url,
      entity.transport,
      decrypt(entity.apiKey),
      dto.toolName,
      dto.arguments,
    );
  }
}
