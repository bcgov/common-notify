import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator'

/**
 * DTO for saving an event's EMAIL channel settings as a draft ("Save draft").
 *
 * Every field except `active` is optional and nullable so a partially filled-in tab can be
 * saved. `active` is always honored directly - chk_event_channel_setting_active_complete
 * exempts draft rows from its completeness check, so the channel can be saved as active ahead
 * of the data being complete. The row is always marked as a draft (`is_draft = true`).
 */
export class UpdateEmailChannelDraftDto {
  /**
   * Whether the event should send on the email channel. Unlike updateEmailChannelSetting, this
   * is accepted even while the channel is incomplete - chk_event_channel_setting_active_complete
   * exempts draft rows from that requirement.
   * @example false
   */
  @IsBoolean()
  active: boolean

  /**
   * From address for email sends. Omit or set null to leave unset.
   * @example "no-reply@gov.bc.ca"
   */
  @IsOptional()
  @ValidateIf((dto: UpdateEmailChannelDraftDto) => dto.senderEmail !== null)
  @IsEmail()
  @MaxLength(320)
  senderEmail?: string | null

  /**
   * Template used to render this channel. Omit or set null to leave unset.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsOptional()
  @ValidateIf((dto: UpdateEmailChannelDraftDto) => dto.templateId !== null)
  @IsUUID()
  templateId?: string | null

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
