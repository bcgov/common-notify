import { IsArray, IsIn, IsString, IsUrl, MinLength } from 'class-validator';
import type { McpTransport, ServiceCategory } from '../entities/mcp-server.entity';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'msgApp',
  'subscription',
  'template',
  'attachment',
];

export class CreateMcpServerDto {
  @IsString()
  @MinLength(1)
  shortName: string;

  @IsUrl({ require_tld: false })
  url: string;

  @IsIn(['streamable-http', 'sse'])
  transport: McpTransport;

  @IsIn(SERVICE_CATEGORIES)
  category: ServiceCategory;

  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsArray()
  @IsString({ each: true })
  enabledTools: string[];
}
