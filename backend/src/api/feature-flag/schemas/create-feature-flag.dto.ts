import { IsString, IsBoolean, IsOptional, IsUUID } from 'class-validator'

/**
 * DTO for creating a new feature flag
 */
export class CreateFeatureFlagDto {
  @IsString()
  code: string

  @IsBoolean()
  enabled: boolean

  @IsOptional()
  @IsUUID()
  tenantId?: string

  @IsOptional()
  @IsString()
  createdBy?: string
}
