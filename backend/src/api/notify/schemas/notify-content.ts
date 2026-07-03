import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class NotifyContent {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'ID of the template to render this content from. Mutually exclusive with inline content.',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string

  @ApiPropertyOptional({
    description: 'Content body (subject for email, message for SMS)',
  })
  @IsOptional()
  @IsString()
  body?: string

  @ApiPropertyOptional({
    description: 'Email subject. Only applicable for email channel.',
  })
  @IsOptional()
  @IsString()
  subject?: string

  @ApiPropertyOptional({
    enum: ['text', 'markdown', 'html'],
    description: 'Content type: text (plain text), markdown (markdown→HTML), html (raw HTML)',
    default: 'html',
  })
  @IsOptional()
  @IsEnum(['text', 'markdown', 'html'])
  bodyType?: 'text' | 'markdown' | 'html'

  @ApiPropertyOptional({
    enum: ['handlebars', 'mustache', 'legacy_gc_notify', 'mjml'],
    description: 'Template rendering engine (handlebars, mustache, legacy_gc_notify, mjml)',
  })
  @IsOptional()
  @IsEnum(['handlebars', 'mustache', 'legacy_gc_notify', 'mjml'])
  renderer?: 'handlebars' | 'mustache' | 'legacy_gc_notify' | 'mjml'

  @ApiPropertyOptional({
    description: 'Character encoding',
  })
  @IsOptional()
  @IsString()
  encoding?: string
}
