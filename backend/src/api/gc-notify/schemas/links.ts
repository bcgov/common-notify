import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class Links {
  @ApiProperty({
    description: 'URL of the page you are looking at.',
    example: 'https://gw-fe8c5-notify.api.gov.bc.ca/gcnotify/v2/notifications',
  })
  current: string

  @ApiPropertyOptional({
    description: 'URL of the next page, absent on the last page.',
    example: 'https://gw-fe8c5-notify.api.gov.bc.ca/gcnotify/v2/notifications?page=2',
  })
  next?: string
}
