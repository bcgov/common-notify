import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'
import { TenantSettings } from '../tenant-settings/entities/tenant-settings.entity'
import { TenantLimit } from './entities/tenant-limit.entity'
import { TenantLimitAlert } from './entities/tenant-limit-alert.entity'
import {
  TenantLimitAlertLog,
  LimitAlertLevel,
  LimitAlertPeriod,
} from './entities/tenant-limit-alert-log.entity'
import { RecordedUsageResult } from './tenant-usage.service'
import { evaluateLimitAlerts } from './limit-alert.evaluator'
import type { LimitAlertToFire } from './limit-alert.evaluator'

export interface ProcessLimitAlertUsageInput {
  tenantId: string
  usageResults: Array<RecordedUsageResult & { channelCode: string }>
}

export interface ClaimedLimitAlert {
  alertLogId: string
  tenantId: string
  recipientEmail: string
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
    @InjectRepository(TenantLimit)
    private readonly tenantLimitRepository: Repository<TenantLimit>,
    @InjectRepository(TenantLimitAlert)
    private readonly tenantLimitAlertRepository: Repository<TenantLimitAlert>,
    @InjectRepository(TenantLimitAlertLog)
    private readonly tenantLimitAlertLogRepository: Repository<TenantLimitAlertLog>,
    @InjectRepository(TenantSettings)
    private readonly tenantSettingsRepository: Repository<TenantSettings>,
  ) {}

  /**
   * Evaluate supplied post-increment DAY/YEAR tenant totals and atomically claim new alerts, so
   * a tenant gets one alert per channel, period and level.
   *
   * Alert configuration is not guaranteed to exist for every limit row. A channel with no
   * enabled configuration row is resolved as alerts disabled; no threshold is invented.
   */
  async evaluateAndClaim(input: ProcessLimitAlertUsageInput): Promise<ClaimedLimitAlert[]> {
    const { tenantId } = input
    if (!tenantId || input.usageResults.length === 0) return []

    const settings = await this.tenantSettingsRepository.findOne({
      where: { tenantId, isDeleted: false },
    })
    if (!settings?.alertEmail) {
      this.logger.warn(`No active alert email configured for tenant ${tenantId}`)
      return []
    }

    const usageByChannel = this.groupUsageByChannel(input.usageResults)
    const recipientEmail = settings.alertEmail

    const claimedByChannel = await Promise.all(
      [...usageByChannel].map(async ([channelCode, usage]): Promise<ClaimedLimitAlert[]> => {
        const where = { tenantId, channelCode }
        const [limit, alertConfig] = await Promise.all([
          this.tenantLimitRepository.findOne({ where }),
          this.tenantLimitAlertRepository.findOne({ where }),
        ])

        if (!limit || !alertConfig?.alertsEnabled) return []

        const candidates = evaluateLimitAlerts({
          channelCode,
          alertsEnabled: true,
          warnThresholdPercent: alertConfig.warnThresholdPercent,
          dailyLimit: limit.dailyLimit,
          annualLimit: limit.annualLimit,
          dayUsage: usage.get(UsagePeriodType.DAY)?.sentCount,
          yearUsage: usage.get(UsagePeriodType.YEAR)?.sentCount,
        })

        const claims = await Promise.all(
          candidates.map(async (candidate): Promise<ClaimedLimitAlert | null> => {
            const usageResult =
              candidate.periodTypeCode === 'DAY'
                ? usage.get(UsagePeriodType.DAY)
                : usage.get(UsagePeriodType.YEAR)
            const periodStart = usageResult!.periodStart
            const claim = await this.claim(tenantId, candidate, periodStart)
            if (!claim) return null

            return {
              alertLogId: claim.id,
              tenantId,
              recipientEmail,
              channelCode: candidate.channelCode,
              periodTypeCode: candidate.periodTypeCode,
              alertLevel: candidate.alertLevel,
              periodStart,
              sentCount: candidate.sentCount,
              limit: candidate.limit,
              percent: candidate.percent,
            }
          }),
        )
        return claims.filter((claim): claim is ClaimedLimitAlert => claim !== null)
      }),
    )

    return claimedByChannel.flat()
  }

  async markNotificationCreated(alertLogId: string, notificationRequestId: string): Promise<void> {
    await this.tenantLimitAlertLogRepository.update({ id: alertLogId }, { notificationRequestId })
  }

  async markEnqueued(alertLogId: string): Promise<void> {
    await this.tenantLimitAlertLogRepository.update({ id: alertLogId }, { enqueuedAt: new Date() })
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
    tenantId: string,
    candidate: LimitAlertToFire,
    periodStart: Date,
  ): Promise<{ id: string } | null> {
    const rows = await this.tenantLimitAlertLogRepository.query(
      `
      INSERT INTO notify.tenant_limit_alert_log
        (tenant_id, channel_code, period_type_code, period_start, alert_level)
      VALUES
        ($1, $2, $3, $4, $5)
      ON CONFLICT (
        tenant_id,
        channel_code,
        period_type_code,
        period_start,
        alert_level
      )
      DO NOTHING
      RETURNING id
      `,
      [
        tenantId,
        candidate.channelCode,
        candidate.periodTypeCode,
        periodStart,
        candidate.alertLevel,
      ],
    )

    return (rows as Array<{ id: string }>)[0] ?? null
  }
}
