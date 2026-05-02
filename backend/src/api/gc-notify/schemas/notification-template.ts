import { ApiProperty } from '@nestjs/swagger'

export class NotificationTemplate {
  @ApiProperty({
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id: string

  @ApiProperty({ description: 'Template version', example: 1 })
  version: number

  @ApiProperty({
    description: 'Template URI',
    example: '/api/gcnotify/v2/templates/123e4567-e89b-12d3-a456-426614174000',
    format: 'uri',
  })
  uri: string
}
