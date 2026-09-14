import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * DTO for creating a new event (Event settings tab)
 *
 * Text fields are trimmed before they are validated: chk_event_name rejects a blank name in the
 * database, so a name of only spaces has to fail here as a 400 rather than reaching the insert.
 */
export class CreateEventDto {
  /**
   * Event name (must be unique within the tenant, case insensitively)
   * @example "Graduates Outcome Survey"
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string

  /**
   * Optional description of what the event is for
   * @example "Sent to graduates six months after program completion"
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  description?: string
}
