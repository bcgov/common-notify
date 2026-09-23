import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiSchema, ApiPropertyOptional, PickType } from '@nestjs/swagger'
import { sanitizeEmailHtml } from '../../../services/rendering/sanitize-email-html'

@ApiSchema({
  description:
    'Message content: either a stored template by templateId, or an inline body with a renderer. Which fields apply depends on the channel - a subject is email only.',
})
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

/**
 * The shapes `content` may take, for documentation only. The runtime DTO stays NotifyContent;
 * the choice is enforced by TemplateOrContentConstraint (templateId never alongside subject/body)
 * and TemplateOrRendererConstraint (templateId never alongside renderer, bodyType or encoding).
 * The keywords that make the shapes mutually exclusive live in schema-constraints.ts.
 *
 * The template branch is templateId and nothing else: a stored template carries its own body type
 * and renderer, and there is nothing left for the request to say about how it renders.
 */
@ApiSchema({
  name: 'TemplateContent',
  description: 'Render a stored template. Cannot be combined with subject, body or renderer.',
})
export class NotifyTemplateContent extends PickType(NotifyContent, ['templateId'] as const) {}

@ApiSchema({
  name: 'EmailInlineContent',
  description: 'Supply the email inline, optionally naming a renderer for the placeholders.',
})
export class NotifyEmailInlineContent extends PickType(NotifyContent, [
  'subject',
  'body',
  'bodyType',
  'renderer',
  'encoding',
] as const) {}

// SMS inline rendering reads only body and renderer. The DTO still accepts subject and bodyType
// on an SMS channel, so they are left out of this schema rather than forbidden by it.
@ApiSchema({
  name: 'SmsInlineContent',
  description:
    'Supply the SMS inline, optionally naming a renderer for the placeholders. SMS is plain ' +
    'text: a subject or bodyType is accepted but has no effect.',
})
export class NotifySmsInlineContent extends PickType(NotifyContent, [
  'body',
  'renderer',
] as const) {}
