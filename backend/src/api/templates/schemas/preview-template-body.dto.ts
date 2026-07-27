import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator'
import { NotificationChannel } from '../../../enum/notification-channel.enum'
import { TemplateEngine } from '../../../enum/template-engine.enum'

/**
 * DTO for previewing arbitrary template content (not a stored template)
 * Renders the provided body/subject with the given engine and sample data.
 * Used by the frontend to preview the current, possibly-unsaved, editor content.
 */
export class PreviewTemplateBodyDto {
  /**
   * Template body with placeholders. Format depends on the selected engine.
   * @example "Dear {{firstName}}, your request for {{eventName}} has been received."
   */
  @IsString()
  body: string

  /**
   * Email subject line (only applicable for email templates)
   */
  @IsOptional()
  @IsString()
  subject?: string

  /**
   * Notification channel type
   * @example "EMAIL"
   */
  @IsEnum(NotificationChannel)
  channelCode: NotificationChannel

  /**
   * Template rendering engine
   * @example "handlebars"
   */
  @IsEnum(TemplateEngine)
  engineCode: TemplateEngine

  /**
   * Object containing parameter values for template rendering
   * Keys correspond to placeholders in the template
   * @example { "firstName": "Molly", "eventName": "Extra Cheese" }
   */
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>
}
