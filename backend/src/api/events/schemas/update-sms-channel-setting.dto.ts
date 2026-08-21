import { IsArray, IsOptional, IsUUID, ValidateIf } from 'class-validator'
import { IsNormalizablePhoneNumber } from '../../notify/schemas/validators/normalizable-phone-number.validator'
import { HasUniqueNormalizedPhoneNumbers } from '../../notify/schemas/validators/unique-normalized-phone-numbers.validator'

/**
 * DTO for updating an event's SMS channel settings (SMS Notification tab)
 *
 * The tab owns every field it submits (other than `active`, which is toggled immediately and
 * separately via UpdateSmsChannelActiveDto), so this replaces the stored settings rather than
 * patching individual ones. `templateId` is required, explicitly nullable so a half-filled draft
 * can be saved. `to` is an optional list of recipient phone numbers, normalized and stored as a
 * comma-separated string. There is no cc/bcc for SMS.
 *
 * If the channel is currently active, the submitted fields must be complete (template, at least
 * one "to" recipient, and a sender number), matching chk_event_channel_setting_active_complete.
 */
export class UpdateSmsChannelSettingDto {
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
