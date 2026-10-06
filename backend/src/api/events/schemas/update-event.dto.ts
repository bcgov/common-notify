import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * DTO for updating an existing event (Event settings tab)
 *
 * Text fields are trimmed before they are validated, so a name of only spaces is rejected here
 * rather than being silently ignored by the service or reaching chk_event_name.
 */
export class UpdateEventDto {
  /**
   * Event name (must be unique within the tenant, case insensitively)
   * @example "Graduates Outcome Survey"
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string

  /**
   * Description of what the event is for
   * @example "Sent to graduates six months after program completion"
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  description?: string
}
