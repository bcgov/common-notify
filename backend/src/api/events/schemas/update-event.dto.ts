import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * DTO for updating an existing event (Event settings tab)
 */
export class UpdateEventDto {
  /**
   * Event name (must be unique within the tenant, case insensitively)
   * @example "Graduates Outcome Survey"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  /**
   * Description of what the event is for
   * @example "Sent to graduates six months after program completion"
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string
}
