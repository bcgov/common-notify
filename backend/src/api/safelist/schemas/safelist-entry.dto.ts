import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RecipientSafelist } from '../entities/recipient-safelist.entity'

/**
 * A safelist entry as the UI consumes it: the stored row plus a human-readable name for whoever
 * added it. `created_by` holds an IDIR GUID, which is meaningless on screen.
 */
export class SafelistEntryDto extends RecipientSafelist {
  @ApiPropertyOptional({
    description:
      'Display name of the user who added the entry, resolved from notify_user. Null when the ' +
      'GUID matches no known user.',
    nullable: true,
  })
  createdByName: string | null
}

export class SafelistListResponseDto {
  @ApiProperty({ type: [SafelistEntryDto] })
  entries: SafelistEntryDto[]

  @ApiProperty({
    description:
      'Whether this environment enforces the safelist (the recipient_safelist feature flag). ' +
      'False in production, where the list is not applied.',
  })
  enforced: boolean

  @ApiProperty({ description: 'Maximum number of entries this tenant may hold.' })
  maxEntries: number
}
