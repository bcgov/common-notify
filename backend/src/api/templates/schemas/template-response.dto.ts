import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationChannel } from '../../../enum/notification-channel.enum'
import { TemplateEngine } from '../../../enum/template-engine.enum'

/**
 * DTO for template responses from the API
 */
export class TemplateResponseDto {
  /**
   * Template ID (UUID)
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string

  /**
   * Template name
   * @example "Funding Approved Email"
   */
  @ApiProperty({
    description: 'Template name, unique within the tenant.',
    example: 'Funding Approved Email',
  })
  name: string

  /**
   * Optional description
   * @example "Email sent to applicants when funding is approved"
   */
  @ApiPropertyOptional({ example: 'Email sent to applicants when funding is approved' })
  description?: string

  /**
   * Notification channel type
   * @example "email"
   */
  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.EMAIL })
  channelCode: NotificationChannel

  /**
   * Email subject (for email templates)
   * @example "Your funding has been approved"
   */
  @ApiPropertyOptional({
    description: 'Email templates only.',
    example: 'Your funding has been approved',
  })
  subject?: string

  /**
   * Template body with placeholders
   * @example "Dear {{firstName}} {{lastName}}, your funding of ${{amount}} has been approved."
   */
  @ApiProperty({ example: 'Dear {{firstName}}, your funding of ${{amount}} has been approved.' })
  body: string

  /**
   * Body content type
   * @example "markdown"
   */
  @ApiPropertyOptional({ enum: ['markdown'], example: 'markdown' })
  bodyType?: 'markdown'

  /**
   * Template rendering engine
   * @example "handlebars"
   */
  @ApiProperty({ enum: TemplateEngine, example: TemplateEngine.HANDLEBARS })
  engineCode: TemplateEngine

  /**
   * Current version number
   * @example 1
   */
  @ApiProperty({
    description: 'Current version. Changing the body or engine creates a new one.',
    example: 1,
  })
  version: number

  /**
   * Whether this is the active version
   * @example true
   */
  @ApiProperty({ description: 'Whether this is the active version.', example: true })
  active: boolean

  /**
   * User who created this template
   * @example "user@example.com"
   */
  @ApiProperty({ example: 'a4d9e0c2-71bf-4a3e-9d18-2c8f5b6e4a70' })
  createdBy: string

  /**
   * Timestamp when template was created
   * @example "2024-05-01T12:00:00Z"
   */
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date

  /**
   * User who last updated this template
   * @example "user@example.com"
   */
  @ApiProperty({ example: 'a4d9e0c2-71bf-4a3e-9d18-2c8f5b6e4a70' })
  updatedBy: string

  /**
   * Timestamp when template was last updated
   * @example "2024-05-01T12:30:00Z"
   */
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date

  /**
   * What a bulk (CSV) send needs to know about this template's placeholders.
   *
   * Returned by the single-template endpoint only - the list endpoint would parse every template
   * on every page load for information no list view uses.
   */
  @ApiPropertyOptional({
    description:
      'The placeholders a bulk (CSV) send needs. Returned by the single-template endpoint only. ' +
      '`paths` are the columns a person fills in; `unsupported` are placeholders that iterate or ' +
      're-scope and so cannot be driven from a flat file.',
    example: { paths: ['firstName', 'amount'], unsupported: [] },
  })
  placeholders?: {
    /** Full dotted paths a person fills in, one spreadsheet column each. */
    paths: string[]
    /** Placeholders that repeat or re-scope, which a flat file cannot supply. */
    unsupported: string[]
  }
}
