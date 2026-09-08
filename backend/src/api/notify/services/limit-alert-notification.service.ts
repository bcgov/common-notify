import { Inject, Injectable, Logger } from '@nestjs/common'
import Bull from 'bull'
import {
  ClaimedLimitAlert,
  LimitAlertService,
  ProcessLimitAlertUsageInput,
} from '../../api-keys/limit-alert.service'
import { NotificationService } from '../../notification/notification.service'
import { NotificationStatus } from '../../../enum/notification-status.enum'
import { QueueName } from '../../../enum/queue-name.enum'
import { IngestionJobPayload } from '../../../queue/queue.types'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'
import { TenantsService } from '../../admin/tenants/tenants.service'
import { COMPLETED_JOB_RETENTION, FAILED_JOB_RETENTION } from '../../../queue/job-retention'

export type ProcessLimitAlertNotificationsInput = ProcessLimitAlertUsageInput

export interface LimitAlertEmailContent {
  subject: string
  body: string
}

export function formatLimitAlertPeriodStart(claim: ClaimedLimitAlert): string {
  const year = claim.periodStart.getUTCFullYear()
  if (claim.periodTypeCode === 'YEAR') return String(year)

  const month = String(claim.periodStart.getUTCMonth() + 1).padStart(2, '0')
  const day = String(claim.periodStart.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildLimitAlertEmail(
  claim: ClaimedLimitAlert,
  tenantDisplayName: string = claim.tenantId,
): LimitAlertEmailContent {
  const periodLabel = claim.periodTypeCode === 'DAY' ? 'daily' : 'annual'
  const levelLabel = claim.alertLevel === 'WARN' ? 'Warning' : 'Limit reached'
  const subject =
    claim.alertLevel === 'WARN'
      ? `Notify usage warning: ${claim.channelCode} ${periodLabel} limit at ${claim.percent}%`
      : `Notify usage limit reached: ${claim.channelCode} ${periodLabel} limit`

  const body = [
    'Notify usage alert',
    '',
    `Tenant: ${tenantDisplayName}`,
    `Monitored channel: ${claim.channelCode}`,
    `Period: ${periodLabel}`,
    `Alert level: ${levelLabel}`,
    `Current sent count: ${claim.sentCount}`,
    `Configured limit: ${claim.limit}`,
    `Usage: ${claim.percent}%`,
    `Period start: ${formatLimitAlertPeriodStart(claim)}`,
  ].join('\n')

  return { subject, body }
}

@Injectable()
export class LimitAlertNotificationService {
  private readonly logger = new Logger(LimitAlertNotificationService.name)

  constructor(
    private readonly limitAlertService: LimitAlertService,
    private readonly notificationService: NotificationService,
    private readonly tenantsService: TenantsService,
    @Inject(QueueName.INGESTION)
    private readonly ingestionQueue: Bull.Queue<IngestionJobPayload>,
  ) {}

  async processAcceptedUsage(input: ProcessLimitAlertNotificationsInput): Promise<void> {
    if (!input.apiKeyConsumerId || input.usageResults.length === 0) return

    let claims: ClaimedLimitAlert[]
    try {
      claims = await this.limitAlertService.evaluateAndClaim(input)
    } catch (error) {
      this.logger.error(
        `Failed to evaluate limit alerts for API key consumer ${input.apiKeyConsumerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return
    }

    for (const claim of claims) {
      try {
        await this.createAndEnqueue(claim)
      } catch (error) {
        this.logger.error(
          `Failed to process limit alert ${claim.alertLogId} for API key consumer ${claim.apiKeyConsumerId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }

  private async createAndEnqueue(claim: ClaimedLimitAlert): Promise<void> {
    const tenantDisplayName = await this.resolveTenantDisplayName(claim.tenantId)
    const content = buildLimitAlertEmail(claim, tenantDisplayName)
    const notifyRequest: NotifySimpleRequest = {
      email: {
        recipients: { to: [claim.recipientEmail] },
        content: {
          subject: content.subject,
          body: content.body,
          bodyType: 'text',
        },
      },
    }

    const notificationRecord = await this.notificationService.create({
      tenantId: claim.tenantId,
      status: NotificationStatus.PENDING,
      createdBy: claim.tenantId,
      payload: notifyRequest,
      isInternal: true,
    })

    await this.limitAlertService.markNotificationCreated(claim.alertLogId, notificationRecord.id)

    const jobPayload: IngestionJobPayload = {
      notifyId: notificationRecord.id,
      tenantId: claim.tenantId,
      request: notifyRequest,
      requestedAt: new Date().toISOString(),
    }

    await this.ingestionQueue.add(jobPayload, {
      jobId: notificationRecord.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: COMPLETED_JOB_RETENTION,
      removeOnFail: FAILED_JOB_RETENTION,
    })

    await this.notificationService.update(notificationRecord.id, claim.tenantId, {
      status: NotificationStatus.QUEUED,
      updatedBy: 'system',
    })
    await this.limitAlertService.markEnqueued(claim.alertLogId)
  }

  private async resolveTenantDisplayName(tenantId: string): Promise<string> {
    try {
      const tenant = await this.tenantsService.findOne(tenantId)
      return tenant?.name || tenantId
    } catch (error) {
      this.logger.warn(
        `Failed to resolve tenant display name for tenant ${tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return tenantId
    }
  }
}
