import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class McpToolDto {
  @Matches(/^[A-Za-z0-9_-]{1,100}$/)
  name: string

  @IsBoolean()
  enabled: boolean

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Matches(/^[A-Za-z_][A-Za-z0-9_]{0,99}$/, { each: true })
  permittedParameters: string[]
}

export class SaveMcpServerDto {
  @IsString()
  @MaxLength(2048)
  url: string

  @Equals('streamable-http')
  protocol: string

  @Matches(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*_MCP_API_KEY$/)
  credentialEnv: string

  @IsBoolean()
  enabled: boolean

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique((tool: McpToolDto) => tool?.name)
  @ValidateNested({ each: true })
  @Type(() => McpToolDto)
  tools: McpToolDto[]
}
