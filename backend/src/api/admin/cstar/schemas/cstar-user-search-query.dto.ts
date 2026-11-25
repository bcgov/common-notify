import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * tenantId is required because CSTAR requires it with Notify's shared service token. CSTAR
 * also requires at least one search field, and its 400 is passed through when none is sent.
 */
class CstarUserSearchQueryDto {
  @ApiProperty({ description: 'The CSTAR tenant the search is for', format: 'uuid' })
  @IsUUID()
  tenantId: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string

  @ApiPropertyOptional({ description: 'The user GUID' })
  @IsOptional()
  @IsString()
  guid?: string
}

export class CstarIdirSearchQueryDto extends CstarUserSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string
}

export class CstarBceidSearchQueryDto extends CstarUserSearchQueryDto {
  @ApiPropertyOptional({ enum: ['business', 'both'] })
  @IsOptional()
  @IsIn(['business', 'both'])
  bceidType?: 'business' | 'both'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string
}
