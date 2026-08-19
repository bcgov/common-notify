import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'
import { TenantSettings } from '../tenant-settings/entities/tenant-settings.entity'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import {
  ApiKeyLimitAlertLog,
  LimitAlertLevel,
  LimitAlertPeriod,
} from './entities/api-key-limit-alert-log.entity'
import { RecordedUsageResult } from './api-key-usage.service'
import { evaluateLimitAlerts } from './limit-alert.evaluator'
import type { LimitAlertToFire } from './limit-alert.evaluator'

export interface ProcessLimitAlertUsageInput {
  apiKeyConsumerId: string
  usageResults: Array<RecordedUsageResult & { channelCode: string }>
}

export interface ClaimedLimitAlert {
  alertLogId: string
  tenantId: string
  recipientEmail: string
  apiKeyConsumerId: string
  channelCode: string
  periodTypeCode: LimitAlertPeriod
  alertLevel: LimitAlertLevel
  periodStart: Date
  sentCount: number
  limit: number
  percent: number
}

@Injectable()
export class LimitAlertService {
  private readonly logger = new Logger(LimitAlertService.name)

  constructor(
    @InjectRepository(ApiKeyConsumer)
    private readonly apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
    @InjectRepository(ApiKeyLimit)
    private readonly apiKeyLimitRepository: Repository<ApiKeyLimit>,
    @InjectRepository(ApiKeyLimitAlert)
    private readonly apiKeyLimitAlertRepository: Repository<ApiKeyLimitAlert>,
    @InjectRepository(ApiKeyLimitAlertLog)
    private readonly apiKeyLimitAlertLogRepository: Repository<ApiKeyLimitAlertLog>,
    @InjectRepository(TenantSettings)
    private readonly tenantSettingsRepository: Repository<TenantSettings>,
  ) {}

  /**
   * Evaluate supplied post-increment DAY/YEAR counts and atomically claim new alerts.
   *
   * Alert configuration is not guaranteed to exist for every limit row. A missing
   * configuration row is resolved as alerts disabled; no threshold is invented.
   */
  async evaluateAndClaim(input: ProcessLimitAlertUsageInput): Promise<ClaimedLimitAlert[]> {
    if (!input.apiKeyConsumerId || input.usageResults.length === 0) return []

    const consumer = await this.apiKeyConsumerRepository.findOne({
      where: { id: input.apiKeyConsumerId },
    })
    if (!consumer) {
      this.logger.warn(
        `No API key consumer found for limit alert evaluation: ${input.apiKeyConsumerId}`,
      )
      return []
    }

    const settings = await this.tenantSettingsRepository.findOne({
      where: { tenantId: consumer.tenantId, isDeleted: false },
    })
    if (!settings?.alertEmail) {
      this.logger.warn(`No active alert email configured for tenant ${consumer.tenantId}`)
      return []
    }

    const usageByChannel = this.groupUsageByChannel(input.usageResults)
    const claimed: ClaimedLimitAlert[] = []

    for (const [channelCode, usage] of usageByChannel) {
      const [limit, alertConfig] = await Promise.all([
        this.apiKeyLimitRepository.findOne({
          where: { apiKeyConsumerId: input.apiKeyConsumerId, channelCode },
        }),
        this.apiKeyLimitAlertRepository.findOne({
          where: { apiKeyConsumerId: input.apiKeyConsumerId, channelCode },
        }),
      ])

      if (!limit || !alertConfig?.alertsEnabled) continue

      const candidates = evaluateLimitAlerts({
        channelCode,
        alertsEnabled: alertConfig.alertsEnabled,
        warnThresholdPercent: alertConfig.warnThresholdPercent,
        dailyLimit: limit.dailyLimit,
        annualLimit: limit.annualLimit,
        dayUsage: usage.get(UsagePeriodType.DAY)?.sentCount,
        yearUsage: usage.get(UsagePeriodType.YEAR)?.sentCount,
      })

      for (const candidate of candidates) {
        const usageResult =
          candidate.periodTypeCode === 'DAY'
            ? usage.get(UsagePeriodType.DAY)
            : usage.get(UsagePeriodType.YEAR)
        const periodStart = usageResult!.periodStart
        const claim = await this.claim(input.apiKeyConsumerId, candidate, periodStart)
        if (!claim) continue

        claimed.push({
          alertLogId: claim.id,
          tenantId: consumer.tenantId,
          recipientEmail: settings.alertEmail,
          apiKeyConsumerId: input.apiKeyConsumerId,
          channelCode: candidate.channelCode,
          periodTypeCode: candidate.periodTypeCode,
          alertLevel: candidate.alertLevel,
          periodStart,
          sentCount: candidate.sentCount,
          limit: candidate.limit,
          percent: candidate.percent,
        })
      }
    }

    return claimed
  }

  async markNotificationCreated(alertLogId: string, notificationRequestId: string): Promise<void> {
    await this.apiKeyLimitAlertLogRepository.update({ id: alertLogId }, { notificationRequestId })
  }

  async markEnqueued(alertLogId: string): Promise<void> {
    await this.apiKeyLimitAlertLogRepository.update({ id: alertLogId }, { enqueuedAt: new Date() })
  }

  private groupUsageByChannel(
    usageResults: ProcessLimitAlertUsageInput['usageResults'],
  ): Map<string, Map<RecordedUsageResult['periodTypeCode'], RecordedUsageResult>> {
    const grouped = new Map<
      string,
      Map<RecordedUsageResult['periodTypeCode'], RecordedUsageResult>
    >()
    for (const result of usageResults) {
      const usage =
        grouped.get(result.channelCode) ??
        new Map<RecordedUsageResult['periodTypeCode'], RecordedUsageResult>()
      usage.set(result.periodTypeCode, result)
      grouped.set(result.channelCode, usage)
    }
    return grouped
  }

  private async claim(
    apiKeyConsumerId: string,
    candidate: LimitAlertToFire,
    periodStart: Date,
  ): Promise<{ id: string } | null> {
    const rows = await this.apiKeyLimitAlertLogRepository.query(
      `
      INSERT INTO notify.api_key_limit_alert_log
        (api_key_consumer_id, channel_code, period_type_code, period_start, alert_level)
      VALUES
        ($1, $2, $3, $4, $5)
      ON CONFLICT (
        api_key_consumer_id,
        channel_code,
        period_type_code,
        period_start,
        alert_level
      )
      DO NOTHING
      RETURNING id
      `,
      [
        apiKeyConsumerId,
        candidate.channelCode,
        candidate.periodTypeCode,
        periodStart,
        candidate.alertLevel,
      ],
    )

    return (rows as Array<{ id: string }>)[0] ?? null
  }
}
