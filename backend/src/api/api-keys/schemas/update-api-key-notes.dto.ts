import { ApiProperty } from '@nestjs/swagger'
import { IsDefined, IsString, Length, ValidateIf } from 'class-validator'
import { API_KEY_NOTES_MAX_LENGTH } from './issue-api-key.dto'

/**
 * Body for editing the note on an existing key.
 *
 * `notes` is required. `null` clears it; omitting it is a 400, not a silent clear —
 * the service cannot distinguish "absent" from "set to nothing", so an accidentally
 * empty PATCH would otherwise destroy what the tenant recorded.
 */
export class UpdateApiKeyNotesDto {
  @ApiProperty({
    description: 'Free-text note, or null to clear it. Required — omitting it is a 400.',
    nullable: true,
    maxLength: API_KEY_NOTES_MAX_LENGTH,
  })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, API_KEY_NOTES_MAX_LENGTH)
  notes!: string | null
}
