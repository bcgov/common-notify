import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Length } from 'class-validator'

/** Maximum length of the free-text note recorded against a key. */
export const API_KEY_NOTES_MAX_LENGTH = 500

/**
 * Body for issuing a key.
 *
 * Nothing here is required: the gateway names the credential, not the caller. Notes
 * are accepted so an API client can record them in one call, but the Notify UI leaves
 * them out and PATCHes them afterwards — the user types the note while looking at the
 * key that has already been issued.
 */
export class IssueApiKeyDto {
  @ApiPropertyOptional({
    description: 'Free-text note, typically where the key has been stored',
    example: 'OpenShift secret app-api-secrets',
    maxLength: API_KEY_NOTES_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @Length(0, API_KEY_NOTES_MAX_LENGTH)
  notes?: string
}
