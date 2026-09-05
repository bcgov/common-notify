import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class NotifyContent {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'ID of the template to render this content from. Mutually exclusive with inline content.',
    example: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string

  @ApiPropertyOptional({
    description:
      'The message body. Placeholders are filled from `params` using the chosen renderer.',
    example: '<p>Hello {{firstName}}, your application has been received.</p>',
  })
  @IsOptional()
  @IsString()
  body?: string

  @ApiPropertyOptional({
    description: 'Email subject. Ignored for SMS.',
    example: 'Your permit application',
  })
  @IsOptional()
  @IsString()
  subject?: string

  @ApiPropertyOptional({
    enum: ['text', 'markdown', 'html'],
    description: 'How to interpret the body: plain text, markdown converted to HTML, or raw HTML.',
    default: 'html',
    example: 'html',
  })
  @IsOptional()
  @IsEnum(['text', 'markdown', 'html'])
  bodyType?: 'text' | 'markdown' | 'html'

  @ApiPropertyOptional({
    enum: ['handlebars', 'mustache', 'legacy_gc_notify', 'mjml'],
    description:
      'Engine used to substitute placeholders in the body. Required when the body contains ' +
      'placeholders and no templateId is given.',
    example: 'handlebars',
  })
  @IsOptional()
  @IsEnum(['handlebars', 'mustache', 'legacy_gc_notify', 'mjml'])
  renderer?: 'handlebars' | 'mustache' | 'legacy_gc_notify' | 'mjml'

  @ApiPropertyOptional({
    description: 'Character encoding of the body.',
    example: 'utf-8',
  })
  @IsOptional()
  @IsString()
  encoding?: string
}
