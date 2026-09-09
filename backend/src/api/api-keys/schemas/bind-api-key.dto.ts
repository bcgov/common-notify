import { IsNotEmpty, IsString, IsUUID } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class BindApiKeyDto {
  @ApiProperty({
    description: 'The CSTAR tenant GUID to associate with this API key',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  cstarTenantId: string
}
