import { IsBoolean } from 'class-validator'

/**
 * DTO for immediately toggling an event's EMAIL channel on/off, independent of the rest of the
 * channel's settings.
 *
 * If turned on while the channel isn't fully configured yet (sender email, a "to" recipient,
 * and a template), the row is saved as a draft (`is_draft = true`) so
 * chk_event_channel_setting_active_complete is still satisfied - the same exemption "Save
 * draft" already relies on. This is required because the rest of the tab's fields are disabled
 * until the channel is switched on, so the toggle must be able to turn the channel on ahead of
 * that data existing.
 */
export class UpdateEmailChannelActiveDto {
  /**
   * Whether the event should send on the email channel.
   * @example true
   */
  @IsBoolean()
  active: boolean
}
