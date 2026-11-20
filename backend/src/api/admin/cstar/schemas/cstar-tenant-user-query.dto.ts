import { IsOptional, Matches } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class CstarTenantUserQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated relations to include: groups, roles, sharedServices',
    example: 'groups,roles',
  })
  @IsOptional()
  @Matches(/^(groups|roles|sharedServices)(,(groups|roles|sharedServices))*$/)
  expand?: string
}
