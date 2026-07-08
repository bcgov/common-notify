import { IsString, IsUUID, MinLength } from 'class-validator';

export class SetDefaultToolDto {
  @IsString()
  @MinLength(1)
  tenantName: string;

  @IsUUID()
  serverId: string;

  @IsString()
  @MinLength(1)
  toolName: string;
}
