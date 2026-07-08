import { IsIn, IsString, IsUrl, MinLength } from 'class-validator';
import type { McpTransport } from '../../mcp-servers/entities/mcp-server.entity';

export class DiscoverServerDto {
  @IsUrl({ require_tld: false })
  url: string;

  @IsIn(['streamable-http', 'sse'])
  transport: McpTransport;

  @IsString()
  @MinLength(1)
  apiKey: string;
}
