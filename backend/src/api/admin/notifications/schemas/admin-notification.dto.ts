import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { ListQueryDto } from '../../../../common/query/list-query.dto'

/**
 * These DTOs carry no recipient addresses and no message content: admins troubleshoot sends
 * across every tenant, so they see what happened, never who it went to or what it said.
 */

/** The shared list query plus a tenant name search. */
export class AdminNotificationQueryDto extends ListQueryDto {
  /** Case-insensitive substring of the tenant name. */
  @IsOptional()
  @IsString()
  search?: string
}

export class AdminNotificationStatusDto {
  @ApiProperty({ example: 'failed' })
  code: string

  @ApiProperty({ example: 'Failed' })
  displayName: string
}

export class AdminNotificationRowDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ format: 'uuid' })
  tenantId: string

  @ApiProperty({ example: 'Parks' })
  tenantName: string

  @ApiProperty({ type: AdminNotificationStatusDto })
  status: AdminNotificationStatusDto

  @ApiProperty({ type: [String], example: ['EMAIL'] })
  channels: string[]

  @ApiProperty({ nullable: true, example: 'notifysimple', type: String })
  requestRoute: string | null

  @ApiProperty({ description: 'When the request was received' })
  createdAt: string

  @ApiProperty({ nullable: true, type: String, description: 'Scheduled send time, if delayed' })
  scheduledFor: string | null

  @ApiProperty({ description: 'Recipient deliveries, one per recipient per channel' })
  recipientCount: number

  @ApiProperty({ description: 'Deliveries that failed' })
  failedCount: number
}

export class PaginatedAdminNotificationResponseDto {
  @ApiProperty({ type: [AdminNotificationRowDto] })
  data: AdminNotificationRowDto[]

  @ApiProperty()
  count: number

  @ApiProperty()
  page: number

  @ApiProperty()
  limit: number

  @ApiProperty()
  totalPages: number
}

export class AdminDeliveryCountDto {
  @ApiProperty({ example: 'EMAIL' })
  channel: string

  @ApiProperty({ example: 'failed' })
  status: string

  @ApiProperty()
  count: number
}

export class AdminStatusChangeDto {
  @ApiProperty({ example: 'processing' })
  status: string

  @ApiProperty()
  at: string
}

export class AdminQuarantineDto {
  @ApiProperty({ type: [String] })
  viruses: string[]

  @ApiProperty()
  reason: string

  @ApiProperty()
  scannedAt: string
}

export class AdminNotificationDetailDto extends AdminNotificationRowDto {
  @ApiProperty()
  updatedAt: string

  @ApiProperty({ nullable: true, type: String, description: 'Request-level error, redacted' })
  errorReason: string | null

  @ApiProperty({ nullable: true, type: AdminQuarantineDto })
  quarantine: AdminQuarantineDto | null

  @ApiProperty({ type: [AdminDeliveryCountDto] })
  deliveryCounts: AdminDeliveryCountDto[]

  @ApiProperty({ type: [AdminStatusChangeDto], description: 'Oldest first' })
  statusHistory: AdminStatusChangeDto[]

  @ApiProperty({ nullable: true, type: String, description: 'Grafana Explore link to the logs' })
  logsUrl: string | null
}

export class AdminDeliveryDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ example: 'EMAIL' })
  channel: string

  @ApiProperty({ example: 'failed' })
  status: string

  @ApiProperty()
  attemptCount: number

  @ApiProperty({ nullable: true, type: String })
  lastAttemptAt: string | null

  @ApiProperty({ nullable: true, type: String, description: 'Redacted' })
  errorMessage: string | null

  @ApiProperty({ nullable: true, type: String, description: 'Provider message id, e.g. CHES' })
  providerResponseId: string | null

  @ApiProperty({ nullable: true, type: String, description: 'Redacted' })
  providerResponse: string | null
}

export class PaginatedAdminDeliveryResponseDto {
  @ApiProperty({ type: [AdminDeliveryDto] })
  data: AdminDeliveryDto[]

  @ApiProperty()
  count: number

  @ApiProperty()
  page: number

  @ApiProperty()
  limit: number

  @ApiProperty()
  totalPages: number
}
