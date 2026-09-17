import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { sanitizeEmailHtml } from '../../../services/rendering/sanitize-email-html'

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
      'The message body. Placeholders are filled from `params` using the chosen renderer. ' +
      'Markdown, not HTML - raw tags are escaped and reach the recipient as visible text.',
    example: '# Hello {{firstName}}\n\nYour application has been received.',
  })
  @IsOptional()
  @IsString()
  // An `html` body is the caller's own markup and is delivered as-is, so it is sanitised here, at
  // the boundary: the stored payload, the preview and the delivered email are then all the same
  // safe HTML. A markdown body needs none of this - markdown-it renders it with `html: false`.
  @Transform(({ value, obj }) =>
    obj?.bodyType === 'html' && typeof value === 'string' ? sanitizeEmailHtml(value) : value,
  )
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
    description:
      'How to interpret the body: markdown converted to HTML, or plain text. ' +
      '`html` keeps your own markup and is gated by the `html_body_type` feature flag - ' +
      'without it the request is rejected. An `html` body is sanitised: formatting, links, ' +
      'images, tables and inline styles are kept, while scripts, form elements, embedded ' +
      'frames and styles that hide content are removed. The delivered email is HTML either ' +
      "way; the flag decides whether the markup is ours or the caller's.",
    default: 'markdown',
    example: 'markdown',
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
