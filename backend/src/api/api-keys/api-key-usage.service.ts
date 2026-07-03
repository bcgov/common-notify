import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { ApiKeyUsage } from './entities/api-key-usage.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'
import {
  AdminTenantUsageRowDto,
  ChannelUsageDto,
  PaginatedAdminUsageResponseDto,
  TenantUsageResponseDto,
  UsageHistoryEntryDto,
} from './dto/tenant-usage-response.dto'

const FISCAL_YEAR_START_KEY = 'fiscal_year_start'
const DEFAULT_FISCAL_MONTH = 4 // April
const DEFAULT_FISCAL_DAY = 1
const DEFAULT_WARN_THRESHOLD_PERCENT = 80

/**
 * Reads notification limits and usage for a tenant and lets an operations admin
 * update the alert threshold.
 *
 * Limits and usage are stored per (API key, channel). A tenant may have more than one
 * API key bound, so values are aggregated per channel across the tenant's keys:
 * limits are summed, usage is summed, and the threshold reported is the most
 * conservative (minimum) configured across keys.
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

    // Aggregate limits per channel across keys.
    const channelMap = new Map<string, ChannelUsageDto>()
    for (const limit of limits) {
      const existing = channelMap.get(limit.channelCode)
      if (!existing) {
        channelMap.set(limit.channelCode, {
          channel: limit.channelCode,
          rateLimitPerMinute: limit.rateLimitPerMinute,
          dailyLimit: limit.dailyLimit,
          annualLimit: limit.annualLimit,
          warnThresholdPercent:
            thresholdByChannel.get(limit.channelCode) ?? DEFAULT_WARN_THRESHOLD_PERCENT,
          usedThisMinute: 0,
          usedToday: 0,
          usedThisYear: 0,
        })
      } else {
        existing.rateLimitPerMinute += limit.rateLimitPerMinute
        existing.dailyLimit += limit.dailyLimit
        existing.annualLimit += limit.annualLimit
      }
    }

    const channels = Array.from(channelMap.values())
      .map((channel) => {
        const usage = usageByChannel.get(channel.channel)
        return {
          ...channel,
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
    const map = new Map<string, number>()
    for (const alert of alerts) {
      const current = map.get(alert.channelCode)
      map.set(
        alert.channelCode,
        current === undefined
          ? alert.warnThresholdPercent
          : Math.min(current, alert.warnThresholdPercent),
      )
    }
    return map
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

    return this.buildUsageRows([tenantId])
  }

  /**
   * Usage vs limits for every tenant, one row per (tenant, channel). For the
   * NOTIFY_ADMIN all-tenants view. Values are aggregated across each tenant's API keys.
   */
  async getAllTenantsUsage(options: {
    page?: number
    limit?: number
    search?: string
  }): Promise<PaginatedAdminUsageResponseDto> {
    const page = Math.max(1, options.page ?? 1)
    const limit = Math.min(100, Math.max(1, options.limit ?? 15))
    const search = options.search?.trim()
    const offset = (page - 1) * limit

    // Count distinct tenants (that have configured limits) matching the search.
    const countQb = this.apiKeyLimitRepository
      .createQueryBuilder('l')
      .innerJoin(ApiKeyConsumer, 'c', 'c.id = l.api_key_consumer_id')
      .innerJoin(Tenant, 't', 't.id = c.tenant_id')
      .select('COUNT(DISTINCT t.id)', 'count')
    if (search) countQb.andWhere('t.name ILIKE :search', { search: `%${search}%` })
    const countRaw = await countQb.getRawOne<{ count: string }>()
    const count = Number(countRaw?.count ?? 0)
    const totalPages = Math.ceil(count / limit)

    if (count === 0) {
      return { data: [], count: 0, page, limit, totalPages: 0 }
    }

    // The page of tenants, ordered by name. Pagination is by TENANT so a tenant's
    // per-channel rows always stay together on the same page.
    const tenantQb = this.apiKeyLimitRepository
      .createQueryBuilder('l')
      .innerJoin(ApiKeyConsumer, 'c', 'c.id = l.api_key_consumer_id')
      .innerJoin(Tenant, 't', 't.id = c.tenant_id')
      .select('t.id', 'tenantId')
      .addSelect('t.name', 'tenantName')
      .groupBy('t.id')
      .addGroupBy('t.name')
      .orderBy('t.name', 'ASC')
      .offset(offset)
      .limit(limit)
    if (search) tenantQb.andWhere('t.name ILIKE :search', { search: `%${search}%` })
    const tenantRows = await tenantQb.getRawMany<{ tenantId: string; tenantName: string }>()

    const data = await this.buildUsageRows(tenantRows.map((t) => t.tenantId))
    return { data, count, page, limit, totalPages }
  }

  /**
   * Build usage-vs-limits rows (one per tenant, channel) for the given tenant ids.
   * Values are aggregated across each tenant's API keys.
   */
  private async buildUsageRows(tenantIds: string[]): Promise<AdminTenantUsageRowDto[]> {
    if (tenantIds.length === 0) return []
    const fiscalYearStart = await this.getFiscalYearStart()

    // Limits per (tenant, channel), summed across the tenant's keys.
    const limitRows = await this.apiKeyLimitRepository
      .createQueryBuilder('l')
      .innerJoin(ApiKeyConsumer, 'c', 'c.id = l.api_key_consumer_id')
      .innerJoin(Tenant, 't', 't.id = c.tenant_id')
      .leftJoin(
        ApiKeyLimitAlert,
        'a',
        'a.api_key_consumer_id = l.api_key_consumer_id AND a.channel_code = l.channel_code',
      )
      .select('t.id', 'tenantId')
      .addSelect('t.name', 'tenantName')
      .addSelect('l.channel_code', 'channelCode')
      .addSelect('SUM(l.rate_limit_per_minute)', 'rateLimitPerMinute')
      .addSelect('SUM(l.daily_limit)', 'dailyLimit')
      .addSelect('SUM(l.annual_limit)', 'annualLimit')
      .addSelect('MIN(a.warn_threshold_percent)', 'warnThresholdPercent')
      .where('t.id IN (:...tenantIds)', { tenantIds })
      .groupBy('t.id')
      .addGroupBy('t.name')
      .addGroupBy('l.channel_code')
      .getRawMany<{
        tenantId: string
        tenantName: string
        channelCode: string
        rateLimitPerMinute: string
        dailyLimit: string
        annualLimit: string
        warnThresholdPercent: string
      }>()

    // Current-window usage per (tenant, channel, period), summed across the tenant's keys.
    const usageRows = await this.apiKeyUsageRepository
      .createQueryBuilder('u')
      .innerJoin(ApiKeyConsumer, 'c', 'c.id = u.api_key_consumer_id')
      .select('c.tenant_id', 'tenantId')
      .addSelect('u.channel_code', 'channelCode')
      .addSelect('u.period_type_code', 'periodTypeCode')
      .addSelect('SUM(u.sent_count)', 'total')
      .where('c.tenant_id IN (:...tenantIds)', { tenantIds })
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

    const usageByKey = new Map<string, { minute: number; day: number; year: number }>()
    for (const row of usageRows) {
      const key = `${row.tenantId}|${row.channelCode}`
      const entry = usageByKey.get(key) ?? { minute: 0, day: 0, year: 0 }
      const total = Number(row.total)
      if (row.periodTypeCode === UsagePeriodType.MINUTE) entry.minute = total
      else if (row.periodTypeCode === UsagePeriodType.DAY) entry.day = total
      else if (row.periodTypeCode === UsagePeriodType.YEAR) entry.year = total
      usageByKey.set(key, entry)
    }

    return limitRows
      .map((row) => {
        const usage = usageByKey.get(`${row.tenantId}|${row.channelCode}`)
        return {
          tenantId: row.tenantId,
          tenantName: row.tenantName,
          channel: row.channelCode,
          rateLimitPerMinute: Number(row.rateLimitPerMinute),
          dailyLimit: Number(row.dailyLimit),
          annualLimit: Number(row.annualLimit),
          warnThresholdPercent:
            row.warnThresholdPercent == null
              ? DEFAULT_WARN_THRESHOLD_PERCENT
              : Number(row.warnThresholdPercent),
          usedThisMinute: usage?.minute ?? 0,
          usedToday: usage?.day ?? 0,
          usedThisYear: usage?.year ?? 0,
        }
      })
      .sort(
        (a, b) => a.tenantName.localeCompare(b.tenantName) || a.channel.localeCompare(b.channel),
      )
  }

  /**
   * Record `count` accepted notifications for an API key on a channel by incrementing the
   * MINUTE, DAY and YEAR usage buckets in a single atomic upsert. Called on send acceptance.
   *
   * Safe to call for any channel; a no-op when count <= 0. Bucket period starts:
   *   MINUTE -> date_trunc('minute', now())
   *   DAY    -> date_trunc('day', now())
   *   YEAR   -> the global fiscal-year start
   */
  async recordUsage(apiKeyConsumerId: string, channel: string, count: number): Promise<void> {
    if (!apiKeyConsumerId || !channel || count <= 0) return

    const fiscalYearStart = await this.getFiscalYearStart()

    await this.apiKeyUsageRepository.query(
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
      `,
      [apiKeyConsumerId, channel, count, fiscalYearStart],
    )
  }

  /**
   * Enforce daily and annual limits before accepting a send. Throws HTTP 429 if any channel
   * in the request would exceed its limit for this API key (used + count > limit); the whole
   * request is rejected. Per-minute rate limiting is handled at the gateway, not here.
   *
   * Fail-open when a channel has no configured limit row (nothing to enforce against).
   *
   * Note: this is a check-then-act against the counters, so under heavy concurrency a small
   * overshoot is possible. Acceptable for now; can be made atomic later if needed.
   */
  async assertWithinLimits(
    apiKeyConsumerId: string,
    entries: Array<{ channel: string; count: number }>,
  ): Promise<void> {
    if (!apiKeyConsumerId) return
    const channels = entries.filter((e) => e.count > 0).map((e) => e.channel)
    if (channels.length === 0) return

    const limits = await this.apiKeyLimitRepository.find({
      where: { apiKeyConsumerId, channelCode: In(channels) },
    })
    const limitByChannel = new Map(limits.map((limit) => [limit.channelCode, limit]))

    const fiscalYearStart = await this.getFiscalYearStart()

    const usageRows = await this.apiKeyUsageRepository
      .createQueryBuilder('u')
      .select('u.channel_code', 'channelCode')
      .addSelect('u.period_type_code', 'periodTypeCode')
      .addSelect('SUM(u.sent_count)', 'total')
      .where('u.api_key_consumer_id = :apiKeyConsumerId', { apiKeyConsumerId })
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

    for (const { channel, count } of entries) {
      if (count <= 0) continue
      const limit = limitByChannel.get(channel)
      if (!limit) continue // fail-open: no configured limit for this channel

      const used = usedByChannel.get(channel) ?? { day: 0, year: 0 }

      if (used.day + count > limit.dailyLimit) {
        throw this.limitExceeded(channel, 'daily', limit.dailyLimit, used.day, count)
      }
      if (used.year + count > limit.annualLimit) {
        throw this.limitExceeded(channel, 'annual', limit.annualLimit, used.year, count)
      }
    }
  }

  private limitExceeded(
    channel: string,
    period: 'daily' | 'annual',
    limit: number,
    used: number,
    requested: number,
  ): HttpException {
    const remaining = Math.max(0, limit - used)
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message:
          `${channel} ${period} notification limit reached. ` +
          `Limit ${limit}, used ${used}, requested ${requested} (${remaining} remaining). ` +
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
