import { ApiProperty } from '@nestjs/swagger'

export class ApprovedEmailLogoDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ nullable: true })
  name: string | null

  @ApiProperty({ description: 'Whether this is the default logo for emails' })
  isDefault: boolean

  @ApiProperty({ nullable: true, description: 'Public-facing title displayed beside the logo' })
  displayTitle: string | null

  @ApiProperty({ format: 'uri' })
  imageUrl: string
}
