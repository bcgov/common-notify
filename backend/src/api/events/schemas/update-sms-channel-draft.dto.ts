import { IsArray, IsOptional, IsUUID, ValidateIf } from 'class-validator'
import { IsNormalizablePhoneNumber } from '../../notify/schemas/validators/normalizable-phone-number.validator'

/**
 * DTO for saving an event's SMS channel settings as a draft ("Save draft").
 *
 * Every field is optional and nullable so a partially filled-in tab can be saved. `active` is
 * not included - it's toggled immediately and separately via UpdateSmsChannelActiveDto, and is
 * left untouched by a draft save. The row is always marked as a draft (`is_draft = true`).
 */
export class UpdateSmsChannelDraftDto {
  /**
   * Template used to render this channel. Omit or set null to leave unset.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsOptional()
  @ValidateIf((dto: UpdateSmsChannelDraftDto) => dto.templateId !== null)
  @IsUUID()
  templateId?: string | null

  /**
   * Primary recipients for this channel.
   * @example ["+12505551234"]
   */
  @IsOptional()
  @IsArray()
  @IsNormalizablePhoneNumber({ each: true })
  to?: string[]
}
