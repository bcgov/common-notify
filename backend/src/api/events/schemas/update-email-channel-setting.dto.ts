import { IsBoolean, IsEmail, MaxLength, ValidateIf } from 'class-validator'

/**
 * DTO for updating an event's EMAIL channel settings (Email Notification tab)
 *
 * The tab owns every field it submits, so this replaces the stored settings rather than
 * patching individual ones. Both properties are required; `senderEmail` is explicitly
 * nullable so a half-filled draft can be saved.
 */
export class UpdateEmailChannelSettingDto {
  /**
   * Whether the event sends on the email channel. Only accepted as true once the channel
   * is fully configured (sender email and template), matching
   * chk_event_channel_setting_active_complete.
   * @example false
   */
  @IsBoolean()
  active: boolean

  /**
   * From address for email sends. Null while the tab is still a draft.
   * @example "no-reply@gov.bc.ca"
   */
  @ValidateIf((dto: UpdateEmailChannelSettingDto) => dto.senderEmail !== null)
  @IsEmail()
  @MaxLength(320)
  senderEmail: string | null
}
