import { ApiProperty } from '@nestjs/swagger'

/**
 * Response shape for a single notification request detail (per-recipient delivery record).
 */
export class NotificationRequestDetailDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  notificationRequestId: string

  @ApiProperty()
  recipientAddress: string

  @ApiProperty()
  channel: string

  @ApiProperty()
  status: string

  @ApiProperty({ required: false })
  providerResponseId?: string

  @ApiProperty({ required: false })
  errorMessage?: string

  @ApiProperty()
  attemptCount: number

  @ApiProperty({ required: false })
  lastAttemptAt?: Date

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date
}
