import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import { NotificationService } from '../notification/notification.service'
import {
  NotificationRequestDetailService,
  notificationRequestDetailListQueryConfig,
} from '../notification/notification-request-detail.service'
import { ListQueryDto } from '../../common/query/list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'

export interface McpNotificationRecipientsResult {
  notificationId: string
  recipients: Array<{
    address: string
    channel: string
    status: string
    attemptCount: number
    lastAttemptAt: string | null
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function clamp(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(1, Math.floor(value)))
    : fallback
}

function toIsoDate(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

@Injectable()
export class McpRecipientsService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationRequestDetailService: NotificationRequestDetailService,
  ) {}

  async getNotificationRecipients(
    tenantId: string,
    input: { notificationId: string; page?: unknown; pageSize?: unknown },
  ): Promise<McpNotificationRecipientsResult> {
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new ForbiddenException('Tenant context is required')
    }
    const { notificationId } = input
    if (!isUUID(notificationId)) {
      throw new BadRequestException('notificationId must be a UUID')
    }
    const page = clamp(input.page, 1, 100000)
    const pageSize = clamp(input.pageSize, 25, 50)

    await this.notificationService.findOne(notificationId, tenantId)
    const parsedQuery = parseListQuery(
      Object.assign(new ListQueryDto(), { page, limit: pageSize }),
      notificationRequestDetailListQueryConfig,
    )
    const result = await this.notificationRequestDetailService.findByRequestIdPaginated(
      notificationId,
      tenantId,
      parsedQuery,
    )
    return {
      notificationId,
      recipients: result.data.map((recipient) => ({
        address: recipient.recipientAddress,
        channel: recipient.channel,
        status: recipient.status,
        attemptCount: recipient.attemptCount,
        lastAttemptAt: toIsoDate(recipient.lastAttemptAt),
      })),
      total: result.count,
      page: result.page,
      pageSize: result.limit,
      totalPages: result.totalPages,
    }
  }
}
