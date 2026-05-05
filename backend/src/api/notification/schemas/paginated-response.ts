import { ApiProperty } from '@nestjs/swagger'
import { NotificationRequestDto } from './notification-request'

export class PaginatedNotificationResponse {
  @ApiProperty({
    description: 'Array of notification request items',
    type: [NotificationRequestDto],
  })
  data: NotificationRequestDto[]

  @ApiProperty({
    description: 'Total number of notification requests',
    example: 42,
  })
  count: number

  @ApiProperty({
    description: 'Current page number (1-indexed)',
    example: 1,
  })
  page: number

  @ApiProperty({
    description: 'Items per page',
    example: 10,
  })
  limit: number

  @ApiProperty({
    description: 'Total number of pages',
    example: 5,
  })
  totalPages: number
}
