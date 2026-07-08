import { IsString, IsUUID, MinLength } from 'class-validator';

export class AddTenantServiceDto {
  @IsString()
  @MinLength(1)
  tenantName: string;

  @IsUUID()
  serverId: string;
}
