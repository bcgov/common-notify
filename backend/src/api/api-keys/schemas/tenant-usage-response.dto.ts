import { ApiProperty } from '@nestjs/swagger'

/**
 * Usage counts for a channel against its current limit windows.
 */
export class ChannelUsageDto {
  @ApiProperty({ description: 'Notification channel', example: 'EMAIL' })
  channel: string

  @ApiProperty({ description: 'API rate limit per minute', example: 1000 })
  rateLimitPerMinute: number

  @ApiProperty({ description: 'Maximum notifications per calendar day', example: 100000 })
  dailyLimit: number

  @ApiProperty({ description: 'Maximum notifications per fiscal year', example: 20000000 })
  annualLimit: number

  @ApiProperty({ description: 'Warning threshold percentage (1-100)', example: 80 })
  warnThresholdPercent: number

  @ApiProperty({ description: 'Notifications sent in the current minute', example: 12 })
  usedThisMinute: number

  @ApiProperty({ description: 'Notifications sent today', example: 4210 })
  usedToday: number

  @ApiProperty({ description: 'Notifications sent this fiscal year', example: 1200000 })
  usedThisYear: number
}

/**
 * A tenant's notification usage against limits, aggregated across the tenant's API keys.
 */
export class TenantUsageResponseDto {
  @ApiProperty({ description: 'Notify tenant id', format: 'uuid' })
  tenantId: string

  @ApiProperty({
    description: 'Start of the current fiscal year (annual window) in ISO 8601',
    example: '2026-04-01T00:00:00.000Z',
  })
  fiscalYearStart: string

  @ApiProperty({ type: [ChannelUsageDto], description: 'Per-channel usage and limits' })
  channels: ChannelUsageDto[]
}

/**
 * A single (tenant, channel) usage row for the admin all-tenants view.
 */
export class AdminTenantUsageRowDto {
  @ApiProperty({ description: 'Notify tenant id', format: 'uuid' })
  tenantId: string

  @ApiProperty({ description: 'Tenant name', example: 'Ministry of Example' })
  tenantName: string

  @ApiProperty({ description: 'Notification channel', example: 'EMAIL' })
  channel: string

  @ApiProperty({ description: 'False when an admin has disabled sending for the tenant' })
  sendingEnabled: boolean

  @ApiProperty({ description: 'Why sending was disabled', nullable: true, type: String })
  disabledReason: string | null

  @ApiProperty({ description: 'When sending was disabled', nullable: true, type: String })
  disabledAt: string | null

  @ApiProperty({ description: 'Who disabled sending (display name)', nullable: true, type: String })
  disabledBy: string | null

  @ApiProperty({
    description: 'API rate limit per minute. Null when the tenant has no limit on this channel.',
    example: 1000,
    nullable: true,
    type: Number,
  })
  rateLimitPerMinute: number | null

  @ApiProperty({
    description:
      'Maximum notifications per calendar day. Null when the tenant has no limit on this channel.',
    example: 100000,
    nullable: true,
    type: Number,
  })
  dailyLimit: number | null

  @ApiProperty({
    description:
      'Maximum notifications per fiscal year. Null when the tenant has no limit on this channel.',
    example: 20000000,
    nullable: true,
    type: Number,
  })
  annualLimit: number | null

  @ApiProperty({
    description:
      'Warning threshold percentage (1-100). Null when the tenant has no limit on this channel.',
    example: 80,
    nullable: true,
    type: Number,
  })
  warnThresholdPercent: number | null

  @ApiProperty({ description: 'Notifications sent in the current minute', example: 12 })
  usedThisMinute: number

  @ApiProperty({ description: 'Notifications sent today', example: 4210 })
  usedToday: number

  @ApiProperty({ description: 'Notifications sent this fiscal year', example: 1200000 })
  usedThisYear: number

  @ApiProperty({
    description: 'When the tenant last sent on this channel, from any source. Null if never.',
    example: '2026-11-03T17:20:00.000Z',
    nullable: true,
    type: String,
  })
  lastSentAt: string | null

  @ApiProperty({
    description:
      'Recipients per month over the last 12 full calendar months, counting from the first ' +
      'send. Null when the tenant has no full month in that window.',
    example: 1240,
    nullable: true,
    type: Number,
  })
  averageMonthlySends: number | null

  @ApiProperty({
    description: 'Recipients sent to on this channel in the last 30 days',
    example: 3100,
  })
  recipientsLast30Days: number

  @ApiProperty({
    description: 'Of those, recipients whose delivery failed. Excludes blocked and quarantined.',
    example: 12,
  })
  failedLast30Days: number
}

/**
 * How many tenants use Notify, for the admin usage screen. Always across every tenant, whatever
 * the table's search or filters.
 */
export class AdminUsageSummaryDto {
  @ApiProperty({ description: 'Tenants with Notify connected in CSTAR', example: 42 })
  tenants: number

  @ApiProperty({
    description: 'Of those, tenants that sent at least one notification this fiscal year',
    example: 30,
  })
  sentThisFiscalYear: number

  @ApiProperty({ description: 'Of those, tenants with an API key bound', example: 12 })
  withApiKey: number

  @ApiProperty({ description: 'Of those, tenants an admin has disabled from sending', example: 1 })
  disabled: number
}

/**
 * Paginated admin all-tenants usage response. Pagination is by tenant (each tenant's
 * per-channel rows stay together); `count` is the number of matching tenants.
 */
export class PaginatedAdminUsageResponseDto {
  @ApiProperty({ type: [AdminTenantUsageRowDto], description: 'Tenant × channel usage rows' })
  data: AdminTenantUsageRowDto[]

  @ApiProperty({ description: 'Total number of matching tenants', example: 42 })
  count: number

  @ApiProperty({ description: 'Current page (1-indexed)', example: 1 })
  page: number

  @ApiProperty({ description: 'Tenants per page', example: 15 })
  limit: number

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages: number
}

/**
 * A single fiscal-year usage history entry for a channel.
 */
export class UsageHistoryEntryDto {
  @ApiProperty({ description: 'Notification channel', example: 'EMAIL' })
  channel: string

  @ApiProperty({
    description: 'Start of the fiscal year this entry covers, ISO 8601',
    example: '2025-04-01T00:00:00.000Z',
  })
  fiscalYearStart: string

  @ApiProperty({ description: 'Notifications sent during that fiscal year', example: 18250000 })
  sentCount: number
}
