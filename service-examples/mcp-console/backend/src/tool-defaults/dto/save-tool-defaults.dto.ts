import { IsIn, IsObject, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class SaveToolDefaultsDto {
  @IsIn(['global', 'tenant'])
  scope: 'global' | 'tenant';

  @ValidateIf((dto: SaveToolDefaultsDto) => dto.scope === 'tenant')
  @IsString()
  @MinLength(1)
  tenantName?: string;

  @IsOptional()
  @IsObject()
  values: Record<string, unknown>;
}
