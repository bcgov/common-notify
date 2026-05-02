import { IsString, IsEnum, IsOptional, MinLength, MaxLength, ValidateIf } from 'class-validator'
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
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string

  /**
   * Optional description of the template
   * @example "Email sent to applicants when funding is approved"
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string

  /**
   * Notification channel type
   * @example "EMAIL"
   */
  @IsEnum(NotificationChannel)
  channelCode: NotificationChannel

  /**
   * Email subject line (required for email templates)
   * @example "Your funding has been approved"
   */
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
  @IsString()
  @MinLength(1)
  body: string

  /**
   * Template rendering engine
   * Defaults to 'handlebars' if not specified
   * @example "handlebars"
   */
  @IsOptional()
  @IsEnum(TemplateEngine)
  engineCode?: TemplateEngine
}
