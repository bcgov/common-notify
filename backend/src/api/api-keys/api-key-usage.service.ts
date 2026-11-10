import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type { SelectQueryBuilder } from 'typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { ApiKeyUsage } from './entities/api-key-usage.entity'
import { lowestLimitsByChannel, lowestThresholdsByChannel } from './tenant-limits'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { TENANT_DISABLED } from '../admin/tenants/tenants.service'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { applyListQueryFilters } from '../../common/query/typeorm-list-query.util'
import type {
  ListQueryFilter,
  ListQuerySort,
  ParsedListQuery,
  QueryableFieldsConfig,
} from '../../common/query/list-query.types'
import {
  AdminTenantOptionDto,
  AdminTenantUsageRowDto,
  AdminUsageSummaryDto,
  ChannelUsageDto,
  PaginatedAdminUsageResponseDto,
  TenantUsageResponseDto,
  UsageHistoryEntryDto,
} from './schemas/tenant-usage-response.dto'

const FISCAL_YEAR_START_KEY = 'fiscal_year_start'
const DEFAULT_FISCAL_MONTH = 4 // April
const DEFAULT_FISCAL_DAY = 1
const DEFAULT_WARN_THRESHOLD_PERCENT = 80

/**
 * What the admin all-tenants usage table can be sorted and filtered on. Tenants are paged, so a
 * sort ranks tenants by their total across the channels in scope; see TENANT_SORTS. The channel
 * filter picks which channel rows each tenant gets rather than which tenants are listed, so it
 * is applied by channelsInScope, not as SQL; `status` (active or disabled) filters the tenants.
 */
export const adminUsageListQueryConfig: QueryableFieldsConfig = {
  sortableFields: {
    failedLast30Days: 'sort_failed',
    usedToday: 'sort_daily',
    usedThisYear: 'sort_annual',
  },
  filterableFields: {
    channel: { column: 'l.channel_code', valueType: 'string', operators: ['eq', 'in'] },
    status: { column: 't.status', valueType: 'string', operators: ['eq', 'in'] },
  },
}

const ALL_CHANNELS: string[] = Object.values(NotificationChannel)

/**
 * Per-tenant totals the admin table sorts on, summed over the channels in scope
 * (:sortChannels), keyed by sort field. Each matches the figure its column shows.
 */
const TENANT_SORTS: Record<string, string> = {
  failedLast30Days: `(SELECT COUNT(*)
      FROM notify.notification_request_detail d
      JOIN notify.notification_request r ON r.id = d.notification_request_id
     WHERE r.tenant_id = t.id AND d.channel IN (:...sortChannels)
       AND d.status = :sortFailedStatus AND d.created_at >= :sortFailedSince)`,
  usedToday: `(SELECT COALESCE(SUM(u.sent_count), 0)
      FROM notify.api_key_usage u
      JOIN notify.api_key_consumer c ON c.id = u.api_key_consumer_id
     WHERE c.tenant_id = t.id AND u.channel_code IN (:...sortChannels)
       AND u.period_type_code = :sortDay AND u.period_start >= date_trunc('day', now()))`,
  usedThisYear: `(SELECT COALESCE(SUM(u.sent_count), 0)
      FROM notify.api_key_usage u
      JOIN notify.api_key_consumer c ON c.id = u.api_key_consumer_id
     WHERE c.tenant_id = t.id AND u.channel_code IN (:...sortChannels)
       AND u.period_type_code = :sortYear AND u.period_start >= :sortFiscalYearStart)`,
}

/** The channels the admin usage rows cover: every channel, narrowed by each channel filter. */
export function channelsInScope(filters: ListQueryFilter[]): string[] {
  return filters
    .filter((filter) => filter.field === 'channel')
    .reduce((channels, filter) => {
      const values = Array.isArray(filter.value) ? filter.value : [filter.value]
      const wanted = new Set(values.map((value) => String(value).toUpperCase()))
      return channels.filter((channel) => wanted.has(channel))
    }, ALL_CHANNELS)
}

type TenantRef = Pick<
  Tenant,
  'id' | 'name' | 'status' | 'disabledReason' | 'disabledAt' | 'disabledBy' | 'disabledByName'
>

interface LimitRow {
  tenantId: string
  channelCode: string
  rateLimitPerMinute: string
  dailyLimit: string
  annualLimit: string
  warnThresholdPercent: string | null
}

interface WindowUsage {
  minute: number
  day: number
  year: number
}

interface SendHistory {
  lastSentAt: Date
  firstSentAt: Date
  /** Recipients in the average's window. */
  windowCount: number
  /** Recipients, and failed recipients, in the last FAILURE_WINDOW_DAYS. */
  recentCount: number
  recentFailed: number
}

/** How far back the admin usage failure count looks. */
export const FAILURE_WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** The 12 full calendar months (UTC) before the one `now` is in: what the monthly average covers. */
export function averageWindow(now: Date): { start: Date; end: Date } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1))
  return { start, end }
}

/**
 * Recipients per month over the window, counting only months from the tenant's first send so a
 * tenant that joined recently isn't averaged over months before it started. Null when the
 * tenant has no full month in the window yet.
 */
export function averageMonthlySends(
  windowCount: number,
  firstSentAt: Date,
  window: { start: Date; end: Date },
): number | null {
  const from = firstSentAt > window.start ? firstSentAt : window.start
  const months =
    (window.end.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (window.end.getUTCMonth() - from.getUTCMonth())
  return months > 0 ? Math.round(windowCount / months) : null
}

export interface RecordedUsageResult {
  periodTypeCode: UsagePeriodType.DAY | UsagePeriodType.YEAR
  periodStart: Date
  sentCount: number
}

/**
 * Reads notification limits and usage for a tenant and lets an operations admin
 * update the alert threshold.
 *
 * Limits apply to the tenant as a whole but are stored per (API key, channel), and a tenant may
 * have several keys bound. Per channel, usage is summed across the tenant's keys and measured
 * against the lowest limit and threshold configured on any of them (see tenant-limits.ts).
 */
@Injectable()
export class ApiKeyUsageService {
  private readonly logger = new Logger(ApiKeyUsageService.name)

  constructor(
    @InjectRepository(ApiKeyConsumer)
    private readonly apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
    @InjectRepository(ApiKeyLimit)
    private readonly apiKeyLimitRepository: Repository<ApiKeyLimit>,
    @InjectRepository(ApiKeyLimitAlert)
    private readonly apiKeyLimitAlertRepository: Repository<ApiKeyLimitAlert>,
    @InjectRepository(ApiKeyUsage)
    private readonly apiKeyUsageRepository: Repository<ApiKeyUsage>,
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Current usage vs configured limits for every channel the tenant has limits on.
   */
  async getTenantUsage(tenantId: string): Promise<TenantUsageResponseDto> {
    const fiscalYearStart = await this.getFiscalYearStart()
    const consumerIds = await this.getConsumerIds(tenantId)

    if (consumerIds.length === 0) {
      return { tenantId, fiscalYearStart: fiscalYearStart.toISOString(), channels: [] }
    }

    const limits = await this.apiKeyLimitRepository.find({
      where: { apiKeyConsumerId: In(consumerIds) },
    })

    // Aggregate current-window usage per (channel, period) across the tenant's keys.
    const usageRows = await this.apiKeyUsageRepository
      .createQueryBuilder('u')
      .select('u.channel_code', 'channelCode')
      .addSelect('u.period_type_code', 'periodTypeCode')
      .addSelect('SUM(u.sent_count)', 'total')
      .where('u.api_key_consumer_id IN (:...consumerIds)', { consumerIds })
      .andWhere(
        `(
          (u.period_type_code = :minute AND u.period_start >= date_trunc('minute', now())) OR
          (u.period_type_code = :day AND u.period_start >= date_trunc('day', now())) OR
          (u.period_type_code = :year AND u.period_start >= :fiscalYearStart)
        )`,
        {
          minute: UsagePeriodType.MINUTE,
          day: UsagePeriodType.DAY,
          year: UsagePeriodType.YEAR,
          fiscalYearStart,
        },
      )
      .groupBy('u.channel_code')
      .addGroupBy('u.period_type_code')
      .getRawMany<{ channelCode: string; periodTypeCode: string; total: string }>()

    const usageByChannel = new Map<string, { minute: number; day: number; year: number }>()
    for (const row of usageRows) {
      const entry = usageByChannel.get(row.channelCode) ?? { minute: 0, day: 0, year: 0 }
      const total = Number(row.total)
      if (row.periodTypeCode === UsagePeriodType.MINUTE) entry.minute = total
      else if (row.periodTypeCode === UsagePeriodType.DAY) entry.day = total
      else if (row.periodTypeCode === UsagePeriodType.YEAR) entry.year = total
      usageByChannel.set(row.channelCode, entry)
    }

    // Alert thresholds live in api_key_limit_alert, most-conservative (minimum) across keys.
    const thresholdByChannel = await this.getThresholdsByChannel(consumerIds)

    const channels = Array.from(lowestLimitsByChannel(limits))
      .map(([channel, limit]): ChannelUsageDto => {
        const usage = usageByChannel.get(channel)
        return {
          channel,
          rateLimitPerMinute: limit.rateLimitPerMinute,
          dailyLimit: limit.dailyLimit,
          annualLimit: limit.annualLimit,
          warnThresholdPercent: thresholdByChannel.get(channel) ?? DEFAULT_WARN_THRESHOLD_PERCENT,
          usedThisMinute: usage?.minute ?? 0,
          usedToday: usage?.day ?? 0,
          usedThisYear: usage?.year ?? 0,
        }
      })
      .sort((a, b) => a.channel.localeCompare(b.channel))

    return { tenantId, fiscalYearStart: fiscalYearStart.toISOString(), channels }
  }

  /**
   * Most-conservative (minimum) warning threshold per channel across the given API keys,
   * read from api_key_limit_alert.
   */
  private async getThresholdsByChannel(consumerIds: string[]): Promise<Map<string, number>> {
    const alerts = await this.apiKeyLimitAlertRepository.find({
      where: { apiKeyConsumerId: In(consumerIds) },
    })
    return lowestThresholdsByChannel(alerts)
  }

  /**
   * Per-fiscal-year usage history for the tenant (retained YEAR buckets), newest first.
   */
  async getUsageHistory(tenantId: string): Promise<UsageHistoryEntryDto[]> {
    const consumerIds = await this.getConsumerIds(tenantId)
    if (consumerIds.length === 0) return []

    const rows = await this.apiKeyUsageRepository
      .createQueryBuilder('u')
      .select('u.channel_code', 'channelCode')
      .addSelect('u.period_start', 'periodStart')
      .addSelect('SUM(u.sent_count)', 'total')
      .where('u.api_key_consumer_id IN (:...consumerIds)', { consumerIds })
      .andWhere('u.period_type_code = :year', { year: UsagePeriodType.YEAR })
      .groupBy('u.channel_code')
      .addGroupBy('u.period_start')
      .orderBy('u.period_start', 'DESC')
      .addOrderBy('u.channel_code', 'ASC')
      .getRawMany<{ channelCode: string; periodStart: Date; total: string }>()

    return rows.map((row) => ({
      channel: row.channelCode,
      fiscalYearStart: new Date(row.periodStart).toISOString(),
      sentCount: Number(row.total),
    }))
  }

  /**
   * Update the warning threshold in every alert-config row a tenant has on the given channel.
   * Restricted to NOTIFY_OPERATIONS_ADMIN at the route level.
   */
  async updateThreshold(
    tenantId: string,
    channel: string,
    warnThresholdPercent: number,
    updatedBy?: string,
  ): Promise<TenantUsageResponseDto> {
    const consumerIds = await this.getConsumerIds(tenantId)
    if (consumerIds.length === 0) {
      throw new NotFoundException('No API keys are bound to this tenant')
    }

    const result = await this.apiKeyLimitAlertRepository.update(
      { apiKeyConsumerId: In(consumerIds), channelCode: channel },
      { warnThresholdPercent, updatedBy, updatedAt: new Date() },
    )

    if (!result.affected) {
      throw new NotFoundException(`No ${channel} alert configuration exists for this tenant`)
    }

    this.logger.log(
      `Updated ${channel} warn threshold to ${warnThresholdPercent}% for tenant ${tenantId}` +
        (updatedBy ? ` by ${updatedBy}` : ''),
    )

    return this.getTenantUsage(tenantId)
  }

  /**
   * Update a tenant's daily and annual limits for a channel (admin only). Applies the same
   * values to every API key the tenant has on that channel. Returns the tenant's refreshed
   * usage rows so the admin table can update in place.
   */
  async updateTenantLimits(
    tenantId: string,
    channel: string,
    dailyLimit: number,
    annualLimit: number,
    updatedBy?: string,
  ): Promise<AdminTenantUsageRowDto[]> {
    const consumerIds = await this.getConsumerIds(tenantId)
    if (consumerIds.length === 0) {
      throw new NotFoundException('No API keys are bound to this tenant')
    }

    const result = await this.apiKeyLimitRepository.update(
      { apiKeyConsumerId: In(consumerIds), channelCode: channel },
      { dailyLimit, annualLimit, updatedBy, updatedAt: new Date() },
    )

    if (!result.affected) {
      throw new NotFoundException(`No ${channel} limits are configured for this tenant`)
    }

    this.logger.log(
      `Updated ${channel} limits (daily=${dailyLimit}, annual=${annualLimit}) for tenant ${tenantId}` +
        (updatedBy ? ` by ${updatedBy}` : ''),
    )

    const tenant = await this.tenantRepository.findOneBy({ id: tenantId })
    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }
    return this.buildUsageRows([tenant], [channel])
  }

  /**
   * Usage vs limits for every tenant, one row per (tenant, channel), for the NOTIFY_ADMIN
   * all-tenants view. Lists every active tenant that came from CSTAR, whether or not it has an
   * API key: CSTAR only returns tenants with Notify connected, so that is the set it syncs. A
   * channel with no limit configured still gets a row, with zero usage and null limits.
   */
  async getAllTenantsUsage(
    parsedQuery: ParsedListQuery,
    search?: string,
  ): Promise<PaginatedAdminUsageResponseDto> {
    const { page, limit, skip, filters } = parsedQuery
    const channels = channelsInScope(filters)
    if (channels.length === 0) {
      return { data: [], count: 0, page, limit, totalPages: 0 }
    }

    // Paged by tenant, so a tenant's channel rows always stay together on one page.
    const qb = this.notifyTenants()
    const term = search?.trim()
    if (term) qb.andWhere('t.name ILIKE :search', { search: `%${term}%` })
    applyListQueryFilters(
      qb,
      filters.filter((filter) => filter.field !== 'channel'),
      adminUsageListQueryConfig,
    )
    await this.applyTenantSorts(qb, parsedQuery.sorts, channels)
    const [tenants, count] = await qb
      .addOrderBy('t.name', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount()

    const data = await this.buildUsageRows(tenants, channels)
    return { data, count, page, limit, totalPages: Math.ceil(count / limit) }
  }

  /**
   * How many tenants use Notify: connected, sending this fiscal year, and disabled.
   * Sending is read from notification requests, not usage rows, because usage is only recorded
   * for sends made with an API key and tenants also send from the UI.
   */
  async getAdminUsageSummary(): Promise<AdminUsageSummaryDto> {
    const fiscalYearStart = await this.getFiscalYearStart()
    const row = await this.notifyTenants()
      .select('COUNT(*)', 'tenants')
      .addSelect(
        `COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM notify.notification_request r
          WHERE r.tenant_id = t.id AND r.created_at >= :fiscalYearStart
        ))`,
        'sentThisFiscalYear',
      )
      .addSelect('COUNT(*) FILTER (WHERE t.status = :disabled)', 'disabled')
      .setParameter('disabled', TENANT_DISABLED)
      .setParameter('fiscalYearStart', fiscalYearStart)
      .getRawOne<{
        tenants: string
        sentThisFiscalYear: string
        disabled: string
      }>()
    return {
      tenants: Number(row?.tenants ?? 0),
      sentThisFiscalYear: Number(row?.sentThisFiscalYear ?? 0),
      disabled: Number(row?.disabled ?? 0),
    }
  }

  /**
   * Orders tenants by each requested total, selected under the alias the sort config names so
   * ORDER BY can use it. Name order, added after, breaks ties.
   */
  private async applyTenantSorts(
    qb: SelectQueryBuilder<Tenant>,
    sorts: ListQuerySort[],
    channels: string[],
  ): Promise<void> {
    if (sorts.length === 0) return
    for (const { field, direction } of sorts) {
      const alias = adminUsageListQueryConfig.sortableFields[field]
      qb.addSelect(TENANT_SORTS[field], alias).addOrderBy(alias, direction)
    }
    qb.setParameters({
      sortChannels: channels,
      sortFailedStatus: NotificationStatus.FAILED,
      sortFailedSince: new Date(Date.now() - FAILURE_WINDOW_DAYS * DAY_MS),
      sortDay: UsagePeriodType.DAY,
      sortYear: UsagePeriodType.YEAR,
    })
    if (sorts.some((sort) => sort.field === 'usedThisYear')) {
      qb.setParameter('sortFiscalYearStart', await this.getFiscalYearStart())
    }
  }

  /** Every tenant the usage table can list, by name: the options for its tenant search. */
  async listNotifyTenants(): Promise<AdminTenantOptionDto[]> {
    const tenants = await this.notifyTenants()
      .select(['t.id', 't.name'])
      .orderBy('t.name', 'ASC')
      .getMany()
    return tenants.map(({ id, name }) => ({ id, name }))
  }

  /**
   * Tenants using Notify: those that came from CSTAR, which only returns tenants with Notify
   * connected, including ones an admin has disabled. Rows created some other way, such as the
   * load-test tenant, have no external id.
   */
  private notifyTenants() {
    return this.tenantRepository
      .createQueryBuilder('t')
      .where('t.isDeleted = :deleted', { deleted: false })
      .andWhere('t.externalId IS NOT NULL')
  }

  /**
   * Usage-vs-limits rows for each tenant on each of the given channels, in the order given.
   * Values are aggregated across each tenant's API keys.
   */
  private async buildUsageRows(
    tenants: TenantRef[],
    channels: string[],
  ): Promise<AdminTenantUsageRowDto[]> {
    if (tenants.length === 0) return []
    const tenantIds = tenants.map((tenant) => tenant.id)
    const window = averageWindow(new Date())
    const [limitsByKey, usageByKey, historyByKey] = await Promise.all([
      this.limitsByTenantChannel(tenantIds, channels),
      this.usageByTenantChannel(tenantIds, channels),
      this.sendHistoryByTenantChannel(tenantIds, channels, window),
    ])

    return tenants.flatMap((tenant) =>
      channels.map((channel) => {
        const key = `${tenant.id}|${channel}`
        const history = historyByKey.get(key)
        return {
          ...toUsageRow(tenant, channel, limitsByKey.get(key), usageByKey.get(key)),
          lastSentAt: history ? history.lastSentAt.toISOString() : null,
          averageMonthlySends: history
            ? averageMonthlySends(history.windowCount, history.firstSentAt, window)
            : null,
          recipientsLast30Days: history?.recentCount ?? 0,
          failedLast30Days: history?.recentFailed ?? 0,
        }
      }),
    )
  }

  /**
   * When each tenant last sent on each channel, how much it sent in the average's window, and
   * how many recipients failed recently. Failed means status `failed`: blocked (safelist) and
   * quarantined (malware) are outcomes of their own, not delivery failures.
   * Read from the per-recipient records rather than usage rows, so sends made from the UI
   * count as well as those made with an API key.
   */
  private async sendHistoryByTenantChannel(
    tenantIds: string[],
    channels: string[],
    window: { start: Date; end: Date },
  ): Promise<Map<string, SendHistory>> {
    const rows: Array<{
      tenant_id: string
      channel: string
      last_sent_at: Date
      first_sent_at: Date
      window_count: string
      recent_count: string
      recent_failed: string
    }> = await this.tenantRepository.query(
      `SELECT r.tenant_id, d.channel,
              MAX(d.created_at) AS last_sent_at,
              MIN(d.created_at) AS first_sent_at,
              COUNT(*) FILTER (WHERE d.created_at >= $3 AND d.created_at < $4) AS window_count,
              COUNT(*) FILTER (WHERE d.created_at >= $5) AS recent_count,
              COUNT(*) FILTER (WHERE d.created_at >= $5 AND d.status = $6) AS recent_failed
         FROM notify.notification_request_detail d
         JOIN notify.notification_request r ON r.id = d.notification_request_id
        WHERE r.tenant_id = ANY($1) AND d.channel = ANY($2)
        GROUP BY r.tenant_id, d.channel`,
      [
        tenantIds,
        channels,
        window.start,
        window.end,
        new Date(Date.now() - FAILURE_WINDOW_DAYS * DAY_MS),
        NotificationStatus.FAILED,
      ],
    )
    return new Map(
      rows.map((row) => [
        `${row.tenant_id}|${row.channel}`,
        {
          lastSentAt: new Date(row.last_sent_at),
          firstSentAt: new Date(row.first_sent_at),
          windowCount: Number(row.window_count),
          recentCount: Number(row.recent_count),
          recentFailed: Number(row.recent_failed),
        },
      ]),
    )
  }

  /** Limits per (tenant, channel): the lowest configured across the tenant's keys. */
  private async limitsByTenantChannel(
    tenantIds: string[],
    channels: string[],
  ): Promise<Map<string, LimitRow>> {
    const rows = await this.apiKeyLimitRepository
      .createQueryBuilder('l')
      .innerJoin(ApiKeyConsumer, 'c', 'c.id = l.api_key_consumer_id')
      .leftJoin(
        ApiKeyLimitAlert,
        'a',
        'a.api_key_consumer_id = l.api_key_consumer_id AND a.channel_code = l.channel_code',
      )
      .select('c.tenant_id', 'tenantId')
      .addSelect('l.channel_code', 'channelCode')
      .addSelect('MIN(l.rate_limit_per_minute)', 'rateLimitPerMinute')
      .addSelect('MIN(l.daily_limit)', 'dailyLimit')
      .addSelect('MIN(l.annual_limit)', 'annualLimit')
      .addSelect('MIN(a.warn_threshold_percent)', 'warnThresholdPercent')
      .where('c.tenant_id IN (:...tenantIds)', { tenantIds })
      .andWhere('l.channel_code IN (:...channels)', { channels })
      .groupBy('c.tenant_id')
      .addGroupBy('l.channel_code')
      .getRawMany<LimitRow>()
    return new Map(rows.map((row) => [`${row.tenantId}|${row.channelCode}`, row]))
  }

  /** Current-window usage per (tenant, channel), summed across the tenant's keys. */
  private async usageByTenantChannel(
    tenantIds: string[],
    channels: string[],
  ): Promise<Map<string, WindowUsage>> {
    const fiscalYearStart = await this.getFiscalYearStart()
    const rows = await this.apiKeyUsageRepository
      .createQueryBuilder('u')
      .innerJoin(ApiKeyConsumer, 'c', 'c.id = u.api_key_consumer_id')
      .select('c.tenant_id', 'tenantId')
      .addSelect('u.channel_code', 'channelCode')
      .addSelect('u.period_type_code', 'periodTypeCode')
      .addSelect('SUM(u.sent_count)', 'total')
      .where('c.tenant_id IN (:...tenantIds)', { tenantIds })
      .andWhere('u.channel_code IN (:...channels)', { channels })
      .andWhere(
        `(
          (u.period_type_code = :minute AND u.period_start >= date_trunc('minute', now())) OR
          (u.period_type_code = :day AND u.period_start >= date_trunc('day', now())) OR
          (u.period_type_code = :year AND u.period_start >= :fiscalYearStart)
        )`,
        {
          minute: UsagePeriodType.MINUTE,
          day: UsagePeriodType.DAY,
          year: UsagePeriodType.YEAR,
          fiscalYearStart,
        },
      )
      .groupBy('c.tenant_id')
      .addGroupBy('u.channel_code')
      .addGroupBy('u.period_type_code')
      .getRawMany<{
        tenantId: string
        channelCode: string
        periodTypeCode: string
        total: string
      }>()

    const usageByKey = new Map<string, WindowUsage>()
    for (const row of rows) {
      const key = `${row.tenantId}|${row.channelCode}`
      const entry = usageByKey.get(key) ?? { minute: 0, day: 0, year: 0 }
      const period = WINDOW_BY_PERIOD[row.periodTypeCode]
      if (period) entry[period] = Number(row.total)
      usageByKey.set(key, entry)
    }
    return usageByKey
  }

  /**
   * Record `count` accepted notifications for an API key on a channel by incrementing the
   * MINUTE, DAY and YEAR usage buckets in a single atomic upsert. Called on send acceptance.
   *
   * Safe to call for any channel; a no-op when count <= 0. Bucket period starts:
   *   MINUTE -> date_trunc('minute', now())
   *   DAY    -> date_trunc('day', now())
   *   YEAR   -> the global fiscal-year start
   *
   * Returns the tenant's post-increment totals for the DAY and YEAR buckets - summed across all
   * of its API keys, because the limits these are alerted against are tenant-wide.
   */
  async recordUsage(
    apiKeyConsumerId: string,
    channel: string,
    count: number,
  ): Promise<RecordedUsageResult[]> {
    if (!apiKeyConsumerId || !channel || count <= 0) return []

    const fiscalYearStart = await this.getFiscalYearStart()

    const rows = await this.apiKeyUsageRepository.query(
      `
      INSERT INTO notify.api_key_usage
        (api_key_consumer_id, channel_code, period_type_code, period_start, sent_count, created_at, updated_at)
      VALUES
        ($1, $2, '${UsagePeriodType.MINUTE}', date_trunc('minute', now()), $3, now(), now()),
        ($1, $2, '${UsagePeriodType.DAY}',    date_trunc('day', now()),    $3, now(), now()),
        ($1, $2, '${UsagePeriodType.YEAR}',   $4,                          $3, now(), now())
      ON CONFLICT (api_key_consumer_id, channel_code, period_type_code, period_start)
      DO UPDATE SET
        sent_count = notify.api_key_usage.sent_count + EXCLUDED.sent_count,
        updated_at = now()
      RETURNING period_type_code, period_start, sent_count
      `,
      [apiKeyConsumerId, channel, count, fiscalYearStart],
    )

    const buckets = (
      rows as Array<{
        period_type_code: UsagePeriodType
        period_start: Date | string
        sent_count: string
      }>
    )
      .filter(
        (
          row,
        ): row is {
          period_type_code: UsagePeriodType.DAY | UsagePeriodType.YEAR
          period_start: Date | string
          sent_count: string
        } =>
          row.period_type_code === UsagePeriodType.DAY ||
          row.period_type_code === UsagePeriodType.YEAR,
      )
      .map((row) => ({
        periodTypeCode: row.period_type_code,
        periodStart: new Date(row.period_start),
        sentCount: Number(row.sent_count),
      }))
    if (buckets.length === 0) return []

    // Read after the upsert commits, so the totals include this send and any concurrent ones.
    const totals = (await this.apiKeyUsageRepository.query(
      `
      SELECT u.period_type_code, SUM(u.sent_count) AS sent_count
      FROM notify.api_key_usage u
      JOIN notify.api_key_consumer c ON c.id = u.api_key_consumer_id
      WHERE c.tenant_id = (SELECT tenant_id FROM notify.api_key_consumer WHERE id = $1)
        AND u.channel_code = $2
        AND (
          (u.period_type_code = '${UsagePeriodType.DAY}' AND u.period_start = $3) OR
          (u.period_type_code = '${UsagePeriodType.YEAR}' AND u.period_start = $4)
        )
      GROUP BY u.period_type_code
      `,
      [
        apiKeyConsumerId,
        channel,
        buckets.find((b) => b.periodTypeCode === UsagePeriodType.DAY)?.periodStart ?? null,
        buckets.find((b) => b.periodTypeCode === UsagePeriodType.YEAR)?.periodStart ?? null,
      ],
    )) as Array<{ period_type_code: UsagePeriodType; sent_count: string }>

    return buckets.map((bucket) => {
      const total = totals.find((row) => row.period_type_code === bucket.periodTypeCode)
      return total ? { ...bucket, sentCount: Number(total.sent_count) } : bucket
    })
  }

  /**
   * Enforce the tenant's daily and annual limits before accepting a send. Usage is summed across
   * every API key bound to the sending key's tenant and checked against the lowest limit on any
   * of them. Throws HTTP 429 if any channel in the request would exceed its limit
   * (used + count > limit); the whole request is rejected. Per-minute rate limiting is handled
   * at the gateway, not here.
   *
   * Fail-open when the key is not bound to a tenant or a channel has no configured limit row.
   *
   * Note: this is a check-then-act against the counters, so under heavy concurrency a small
   * overshoot is possible. Acceptable for now; can be made atomic later if needed.
   */
  async assertWithinLimits(
    apiKeyConsumerId: string,
    entries: Array<{ channel: string; count: number; countExplanation?: string }>,
  ): Promise<void> {
    if (!apiKeyConsumerId) return
    const channels = entries.filter((e) => e.count > 0).map((e) => e.channel)
    if (channels.length === 0) return

    const consumerIds = await this.getTenantConsumerIds(apiKeyConsumerId)
    if (consumerIds.length === 0) return

    const limits = await this.apiKeyLimitRepository.find({
      where: { apiKeyConsumerId: In(consumerIds), channelCode: In(channels) },
    })
    const limitByChannel = lowestLimitsByChannel(limits)

    const fiscalYearStart = await this.getFiscalYearStart()

    const usageRows = await this.apiKeyUsageRepository
      .createQueryBuilder('u')
      .select('u.channel_code', 'channelCode')
      .addSelect('u.period_type_code', 'periodTypeCode')
      .addSelect('SUM(u.sent_count)', 'total')
      .where('u.api_key_consumer_id IN (:...consumerIds)', { consumerIds })
      .andWhere('u.channel_code IN (:...channels)', { channels })
      .andWhere(
        `(
          (u.period_type_code = :day AND u.period_start >= date_trunc('day', now())) OR
          (u.period_type_code = :year AND u.period_start >= :fiscalYearStart)
        )`,
        { day: UsagePeriodType.DAY, year: UsagePeriodType.YEAR, fiscalYearStart },
      )
      .groupBy('u.channel_code')
      .addGroupBy('u.period_type_code')
      .getRawMany<{ channelCode: string; periodTypeCode: string; total: string }>()

    const usedByChannel = new Map<string, { day: number; year: number }>()
    for (const row of usageRows) {
      const entry = usedByChannel.get(row.channelCode) ?? { day: 0, year: 0 }
      const total = Number(row.total)
      if (row.periodTypeCode === UsagePeriodType.DAY) entry.day = total
      else if (row.periodTypeCode === UsagePeriodType.YEAR) entry.year = total
      usedByChannel.set(row.channelCode, entry)
    }

    for (const { channel, count, countExplanation } of entries) {
      if (count <= 0) continue
      const limit = limitByChannel.get(channel)
      if (!limit) continue // fail-open: no configured limit for this channel

      const used = usedByChannel.get(channel) ?? { day: 0, year: 0 }

      if (used.day + count > limit.dailyLimit) {
        throw this.limitExceeded(
          channel,
          'daily',
          limit.dailyLimit,
          used.day,
          count,
          countExplanation,
        )
      }
      if (used.year + count > limit.annualLimit) {
        throw this.limitExceeded(
          channel,
          'annual',
          limit.annualLimit,
          used.year,
          count,
          countExplanation,
        )
      }
    }
  }

  /**
   * `countExplanation` spells out how `requested` was derived when it is not simply the number
   * of recipients — an SMS long enough to be split is billed as several messages, so a caller
   * sending one SMS to one recipient can be told why the request costs three.
   */
  private limitExceeded(
    channel: string,
    period: 'daily' | 'annual',
    limit: number,
    used: number,
    requested: number,
    countExplanation?: string,
  ): HttpException {
    const remaining = Math.max(0, limit - used)
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message:
          `${channel} ${period} notification limit reached. ` +
          `Limit ${limit}, used ${used}, requested ${requested}` +
          (countExplanation ? ` (${countExplanation})` : '') +
          ` (${remaining} remaining). ` +
          `Try again after the ${period} window resets.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }

  private async getConsumerIds(tenantId: string): Promise<string[]> {
    const consumers = await this.apiKeyConsumerRepository.find({
      where: { tenantId },
      select: { id: true },
    })
    return consumers.map((consumer) => consumer.id)
  }

  /** Every API key bound to the same tenant as the given key, the key itself included. */
  private async getTenantConsumerIds(apiKeyConsumerId: string): Promise<string[]> {
    const consumer = await this.apiKeyConsumerRepository.findOne({
      where: { id: apiKeyConsumerId },
      select: { id: true, tenantId: true },
    })
    return consumer ? this.getConsumerIds(consumer.tenantId) : []
  }

  /**
   * Compute the start of the current fiscal year from the global
   * notify.configuration 'fiscal_year_start' setting (defaults to April 1).
   */
  private async getFiscalYearStart(now: Date = new Date()): Promise<Date> {
    let month = DEFAULT_FISCAL_MONTH
    let day = DEFAULT_FISCAL_DAY

    const config = await this.configurationRepository.findOne({
      where: { key: FISCAL_YEAR_START_KEY },
    })
    const value = config?.config as { month?: number; day?: number } | undefined
    if (value?.month) month = value.month
    if (value?.day) day = value.day

    let year = now.getUTCFullYear()
    const candidate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
    if (now.getTime() < candidate.getTime()) {
      year -= 1
    }
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  }
}

const WINDOW_BY_PERIOD: Record<string, keyof WindowUsage> = {
  [UsagePeriodType.MINUTE]: 'minute',
  [UsagePeriodType.DAY]: 'day',
  [UsagePeriodType.YEAR]: 'year',
}

/** One admin usage row. Limits are null when the tenant has none on this channel. */
function toUsageRow(
  tenant: TenantRef,
  channel: string,
  limits: LimitRow | undefined,
  usage: WindowUsage | undefined,
): Omit<
  AdminTenantUsageRowDto,
  'lastSentAt' | 'averageMonthlySends' | 'recipientsLast30Days' | 'failedLast30Days'
> {
  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    sendingEnabled: tenant.status !== TENANT_DISABLED,
    disabledReason: tenant.disabledReason ?? null,
    disabledAt: tenant.disabledAt ? new Date(tenant.disabledAt).toISOString() : null,
    disabledBy: tenant.disabledByName ?? tenant.disabledBy ?? null,
    channel,
    rateLimitPerMinute: limits ? Number(limits.rateLimitPerMinute) : null,
    dailyLimit: limits ? Number(limits.dailyLimit) : null,
    annualLimit: limits ? Number(limits.annualLimit) : null,
    warnThresholdPercent: limits ? thresholdOf(limits) : null,
    usedThisMinute: usage?.minute ?? 0,
    usedToday: usage?.day ?? 0,
    usedThisYear: usage?.year ?? 0,
  }
}

function thresholdOf(limits: LimitRow): number {
  return limits.warnThresholdPercent == null
    ? DEFAULT_WARN_THRESHOLD_PERCENT
    : Number(limits.warnThresholdPercent)
}
