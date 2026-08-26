import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Length, ValidateIf } from 'class-validator'
import { API_KEY_NOTES_MAX_LENGTH } from './issue-api-key.dto'

/**
 * Body for editing the note on an existing key.
 *
 * `null` clears the note. An omitted field is rejected rather than treated as a clear,
 * so an accidentally empty PATCH cannot silently wipe what the tenant recorded.
 */
export class UpdateApiKeyNotesDto {
  @ApiPropertyOptional({
    description: 'Free-text note, or null to clear it',
    nullable: true,
    maxLength: API_KEY_NOTES_MAX_LENGTH,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, API_KEY_NOTES_MAX_LENGTH)
  notes?: string | null
}
