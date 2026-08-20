import { IsArray, IsBoolean, IsEmail, IsOptional, IsUUID, MaxLength, ValidateIf } from 'class-validator'

/**
 * DTO for updating an event's EMAIL channel settings (Email Notification tab)
 *
 * The tab owns every field it submits, so this replaces the stored settings rather than
 * patching individual ones. `active`, `senderEmail` and `templateId` are required; the latter
 * two are explicitly nullable so a half-filled draft can be saved. `to`/`cc`/`bcc` are optional
 * lists of recipient addresses, normalized and stored as comma-separated strings.
 */
export class UpdateEmailChannelSettingDto {
  /**
   * Whether the event sends on the email channel. Only accepted as true once the channel
   * is fully configured (sender email, at least one "to" recipient, and template), matching
   * chk_event_channel_setting_active_complete.
   * @example false
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
}
