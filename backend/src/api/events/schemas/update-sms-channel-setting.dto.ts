import { IsArray, IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator'
import { IsNormalizablePhoneNumber } from '../../notify/schemas/validators/normalizable-phone-number.validator'
import { HasUniqueNormalizedPhoneNumbers } from '../../notify/schemas/validators/unique-normalized-phone-numbers.validator'

/**
 * DTO for updating an event's SMS channel settings (SMS Notification tab)
 *
 * The tab owns every field it submits, so this replaces the stored settings rather than patching
 * individual ones. `templateId` is required, explicitly nullable so an inactive channel can be
 * saved half-filled. `to` is an optional list of recipient phone numbers, normalized and stored
 * as a comma-separated string. There is no cc/bcc for SMS.
 *
 * `active` is included here because this is the only path that switches the channel on - the
 * tab's toggle is local until the settings are applied. When it is true the submitted fields
 * must be complete (template, at least one "to" recipient, and a sender number), matching
 * chk_event_channel_setting_active_complete.
 */
export class UpdateSmsChannelSettingDto {
  /**
   * Whether the event should send on the SMS channel once these settings are saved.
   * @example true
   */
  @IsBoolean()
  active: boolean

  /**
   * Template used to render this channel. Required before the channel can be activated,
   * matching chk_event_channel_setting_active_complete.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @ValidateIf((dto: UpdateSmsChannelSettingDto) => dto.templateId !== null)
  @IsUUID()
  templateId: string | null

  /**
   * Primary recipients for this channel.
   * @example ["+12505551234"]
   */
  @IsOptional()
  @IsArray()
  @IsNormalizablePhoneNumber({ each: true })
  @HasUniqueNormalizedPhoneNumbers()
  to?: string[]
}
