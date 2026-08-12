import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * DTO for creating a new event (Event settings tab)
 */
export class CreateEventDto {
  /**
   * Event name (must be unique within the tenant, case insensitively)
   * @example "Graduates Outcome Survey"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string

  /**
   * Optional description of what the event is for
   * @example "Sent to graduates six months after program completion"
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string
}
