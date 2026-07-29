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

export type ProcessLimitAlertNotificationsInput = ProcessLimitAlertUsageInput

export interface LimitAlertEmailContent {
  subject: string
  body: string
}

export function buildLimitAlertEmail(claim: ClaimedLimitAlert): LimitAlertEmailContent {
  const periodLabel = claim.periodTypeCode === 'DAY' ? 'daily' : 'annual'
  const levelLabel = claim.alertLevel === 'WARN' ? 'Warning' : 'Limit reached'
  const subject =
    claim.alertLevel === 'WARN'
      ? `BC Notify usage warning: ${claim.channelCode} ${periodLabel} limit at ${claim.percent}%`
      : `BC Notify usage limit reached: ${claim.channelCode} ${periodLabel} limit`

  const body = [
    'BC Notify usage alert',
    '',
    `Tenant: ${claim.tenantId}`,
    `Monitored channel: ${claim.channelCode}`,
    `Period: ${periodLabel}`,
    `Alert level: ${levelLabel}`,
    `Current sent count: ${claim.sentCount}`,
    `Configured limit: ${claim.limit}`,
    `Usage: ${claim.percent}%`,
    `Period start: ${claim.periodStart.toISOString()}`,
  ].join('\n')

  return { subject, body }
}

@Injectable()
export class LimitAlertNotificationService {
  private readonly logger = new Logger(LimitAlertNotificationService.name)

  constructor(
    private readonly limitAlertService: LimitAlertService,
    private readonly notificationService: NotificationService,
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
    const content = buildLimitAlertEmail(claim)
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
      removeOnComplete: false,
      removeOnFail: false,
    })

    await this.notificationService.update(notificationRecord.id, claim.tenantId, {
      status: NotificationStatus.QUEUED,
      updatedBy: 'system',
    })
    await this.limitAlertService.markEnqueued(claim.alertLogId)
  }
}
