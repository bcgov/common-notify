import { ApiProperty } from '@nestjs/swagger'

export class TenantDto {
  @ApiProperty()
  id: number

  @ApiProperty({
    description: 'Unique tenant name (Kong consumer username)',
  })
  name: string

  @ApiProperty({
    description: 'Human-readable description',
  })
  description: string

  @ApiProperty({
    description: 'Organization name',
  })
  organization: string

  @ApiProperty({
    description: 'Contact email',
  })
  contactEmail: string

  @ApiProperty({
    description: 'Contact name',
  })
  contactName: string

  @ApiProperty({
    description: 'Kong consumer ID',
  })
  kongConsumerId: string

  @ApiProperty({
    description: 'Kong consumer username',
  })
  kongUsername: string

  @ApiProperty({
    enum: ['active', 'inactive', 'suspended'],
    description: 'Tenant status',
  })
  status: string

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date
}

export class CreateTenantResponseDto {
  @ApiProperty()
  tenant: TenantDto

  @ApiProperty({
    description: 'Newly generated API key (shown only once)',
  })
  apiKey: string

  @ApiProperty({
    description: 'Note: Store this key securely. It cannot be retrieved later.',
  })
  note: string
}
