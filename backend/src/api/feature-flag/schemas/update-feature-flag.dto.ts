import { IsBoolean, IsOptional, IsString } from 'class-validator'

/**
 * DTO for updating an existing feature flag
 */
export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  updatedBy?: string
}
