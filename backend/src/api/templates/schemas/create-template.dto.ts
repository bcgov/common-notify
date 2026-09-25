import { IsString, IsEnum, IsOptional, MinLength, MaxLength, ValidateIf } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationChannel } from '../../../enum/notification-channel.enum'
import { TemplateEngine } from '../../../enum/template-engine.enum'

/**
 * DTO for creating a new template
 */
export class CreateTemplateDto {
  /**
   * Template name (must be unique within the tenant)
   * @example "Funding Approved Email"
   */
  @ApiProperty({
    description: 'Template name. Must be unique within the tenant.',
    example: 'Funding Approved Email',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string

  /**
   * Optional description of the template
   * @example "Email sent to applicants when funding is approved"
   */
  @ApiPropertyOptional({
    description: 'What this template is for.',
    example: 'Email sent to applicants when funding is approved',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string

  /**
   * Notification channel type
   * @example "EMAIL"
   */
  @ApiProperty({
    description: 'Channel this template sends on.',
    enum: NotificationChannel,
    example: NotificationChannel.EMAIL,
  })
  @IsEnum(NotificationChannel)
  channelCode: NotificationChannel

  /**
   * Email subject line (required for email templates)
   * @example "Your funding has been approved"
   */
  @ApiPropertyOptional({
    description: 'Email subject line. Required when channelCode is EMAIL, ignored otherwise.',
    example: 'Your funding has been approved',
    minLength: 1,
    maxLength: 500,
  })
  @ValidateIf((obj) => obj.channelCode === NotificationChannel.EMAIL)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject?: string

  /**
   * Template body with placeholders
   * Format depends on the selected engine
   * @example "Dear {{firstName}} {{lastName}}, your funding of ${{amount}} has been approved."
   */
  @ApiProperty({
    description:
      'Template body with placeholders. The placeholder syntax depends on engineCode: {{name}} for ' +
      'handlebars and mustache, ((name)) for the GC Notify engines.',
    example: 'Dear {{firstName}}, your funding of ${{amount}} has been approved.',
    minLength: 1,
    maxLength: 10000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body: string

  /**
   * Template rendering engine
   * Defaults to 'handlebars' if not specified
   * @example "handlebars"
   */
  @ApiPropertyOptional({
    description: 'Rendering engine. Defaults to handlebars.',
    enum: TemplateEngine,
    example: TemplateEngine.HANDLEBARS,
  })
  @IsOptional()
  @IsEnum(TemplateEngine)
  engineCode?: TemplateEngine

  /**
   * Body content type for rendering: markdown (markdown→HTML)
   * Optional for MJML templates; ignored when engineCode is MJML
   * @example "markdown"
   */
  @ApiPropertyOptional({
    description:
      'How the body is interpreted. Only markdown is accepted; MJML templates compile to HTML on ' +
      'their own and ignore this.',
    enum: ['markdown'],
    example: 'markdown',
  })
  @IsOptional()
  @IsEnum(['markdown'])
  bodyType?: 'markdown'
}
