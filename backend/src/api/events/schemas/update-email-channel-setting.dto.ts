import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator'

/**
 * DTO for updating an event's EMAIL channel settings (Email Notification tab)
 *
 * The tab owns every field it submits, so this replaces the stored settings rather than patching
 * individual ones. `senderEmail` and `templateId` are required, explicitly nullable so an
 * inactive channel can be saved half-filled. `to`/`cc`/`bcc` are optional lists of recipient
 * addresses, normalized and stored as comma-separated strings.
 *
 * `active` is included here because this is the only path that switches the channel on - the
 * tab's toggle is local until the settings are applied. When it is true the submitted fields
 * must be complete (sender email, at least one "to" recipient, and template), matching
 * chk_event_channel_setting_active_complete.
 */
export class UpdateEmailChannelSettingDto {
  /**
   * Whether the event should send on the email channel once these settings are saved.
   * @example true
   */
  @IsBoolean()
  active: boolean

  /**
   * From address for email sends, overrides default sender address from settings.
   * @example "no-reply@gov.bc.ca"
   */
  @ValidateIf((dto: UpdateEmailChannelSettingDto) => dto.senderEmail !== null)
  @IsEmail()
  @MaxLength(320)
  senderEmail: string | null

  /**
   * Template used to render this channel. Required before the channel can be activated,
   * matching chk_event_channel_setting_active_complete.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @ValidateIf((dto: UpdateEmailChannelSettingDto) => dto.templateId !== null)
  @IsUUID()
  templateId: string | null

  /**
   * Primary recipients for this channel.
   * @example ["alice@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  to?: string[]

  /**
   * CC recipients for this channel.
   * @example ["bob@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[]

  /**
   * BCC recipients for this channel.
   * @example ["carol@example.com"]
   */
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[]

  /**
   * Whether the email uses a custom header rather than the tenant's default one. Omitted means
   * the tenant default, which is also what clears any stored header values.
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  useCustomHeader?: boolean

  /**
   * Approved email logo shown in the custom header. Null for a custom header with no logo.
   * Ignored unless useCustomHeader is true.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsOptional()
  @IsUUID()
  headerLogoId?: string | null

  /**
   * Title text shown beside the logo in the custom header. Ignored unless useCustomHeader is true.
   * @example "Ministry of Education"
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  headerTitle?: string | null
}
