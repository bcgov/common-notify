import { ApiProperty } from '@nestjs/swagger'

export class ApprovedEmailLogoDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ nullable: true })
  name: string | null

  @ApiProperty({ format: 'uri' })
  imageUrl: string
}
