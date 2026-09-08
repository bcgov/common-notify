import { NotificationChannel } from '../../enum/notification-channel.enum'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, Not, Repository } from 'typeorm'
import { NotificationRequestDetail } from './entities/notification-request-detail.entity'
import { ProcessedNotifySimpleRequest } from '../notify/schemas/stored-notify-attachment'
import { NotifySimpleRequest } from '../notify/schemas/notify-simple-request'
import { TenantsService } from '../admin/tenants/tenants.service'
import { applyParsedListQueryToQueryBuilder } from '../../common/query/typeorm-list-query.util'
import type { ParsedListQuery, QueryableFieldsConfig } from '../../common/query/list-query.types'
import { PaginatedNotificationRequestDetailResponse } from './schemas/paginated-request-detail-response'

/**
 * Queryable fields for the per-recipient request detail list. Sorting/filtering/search all run
 * in the database via the shared list-query utilities.
 */
export const notificationRequestDetailListQueryConfig: QueryableFieldsConfig = {
  sortableFields: {
    recipientAddress: 'detail.recipientAddress',
    channel: 'detail.channel',
    status: 'detail.status',
    createdAt: 'detail.createdAt',
  },
  filterableFields: {
    channel: {
      column: 'detail.channel',
      valueType: 'string',
      operators: ['eq', 'in'],
    },
    status: {
      column: 'detail.status',
      valueType: 'string',
      operators: ['eq', 'in'],
    },
  },
  defaultSort: [{ field: 'createdAt', direction: 'DESC' }],
}

@Injectable()
export class NotificationRequestDetailService {
  constructor(
    @InjectRepository(NotificationRequestDetail)
    private readonly detailRepository: Repository<NotificationRequestDetail>,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * Create pending request detail records (one per recipient) before reaching the ingestion queue.
   */
  async createPending(
    notificationRequestId: string,
    payload: NotifySimpleRequest | ProcessedNotifySimpleRequest | undefined,
    createdBy?: string,
  ): Promise<void> {
    const { recipients } = this.extractRecipients(payload)
    if (
      recipients.email.length === 0 &&
      recipients.sms.length === 0 &&
      recipients.msgApp.length === 0
    )
      return
    const now = new Date()
    const makeEntity = (
      address: string,
      channel: string,
      emailAddressType?: 'primary' | 'cc' | 'bcc',
    ) =>
      this.detailRepository.create({
        notificationRequestId,
        recipientAddress: address,
        channel,
        emailAddressType,
        status: 'pending',
        attemptCount: 1,
        lastAttemptAt: now,
        createdBy,
        updatedBy: createdBy,
      })
    const entities = [
      ...recipients.email.map(({ address, emailAddressType }) =>
        makeEntity(address, 'EMAIL', emailAddressType),
      ),
      ...recipients.sms.map((address) => makeEntity(address, 'SMS')),
      ...recipients.msgApp.map((address) => makeEntity(address, 'MSGAPP')),
    ]
    await this.detailRepository.save(entities)
  }

  /**
   * Create pending request detail records for one batch of a mail merge email send.
   * Each record is tagged with the shared batchId so a delivery worker can scope updates to its batch.
   */
  async createMergePending(
    notificationRequestId: string,
    batchId: string,
    addresses: string[],
    channel: NotificationChannel = NotificationChannel.EMAIL,
    createdBy?: string,
  ): Promise<void> {
    if (addresses.length === 0) return
    const now = new Date()
    const isEmail = channel === NotificationChannel.EMAIL
    const entities = addresses.map((address) =>
      this.detailRepository.create({
        notificationRequestId,
        batchId,
        recipientAddress: address,
        channel,
        // Only meaningful for email, where a recipient can be a to/cc/bcc.
        ...(isEmail && { emailAddressType: 'primary' }),
        status: 'pending',
        attemptCount: 1,
        lastAttemptAt: now,
        createdBy,
        updatedBy: createdBy,
      }),
    )
    await this.detailRepository.save(entities)
  }

  /**
   * Record recipients that were never attempted because they are not on the tenant safelist.
   * Written at accept time, so these rows carry no attempt count and no batchId.
   */
  async createBlocked(
    notificationRequestId: string,
    recipients: Array<{ address: string; channel: string }>,
    errorMessage: string,
    createdBy?: string,
  ): Promise<void> {
    if (recipients.length === 0) return

    // A mail merge may list the same address more than once. Saving duplicates would violate
    // uq_notification_request_detail_recipient and fail the whole insert, losing the record of
    // every blocked recipient — so collapse them on the same key the constraint uses.
    const unique = new Map(
      recipients.map((recipient) => [`${recipient.channel}::${recipient.address}`, recipient]),
    )

    const entities = [...unique.values()].map(({ address, channel }) =>
      this.detailRepository.create({
        notificationRequestId,
        recipientAddress: address,
        channel,
        emailAddressType: channel === 'EMAIL' ? 'primary' : undefined,
        status: 'blocked',
        attemptCount: 0,
        errorMessage,
        createdBy,
        updatedBy: createdBy,
      }),
    )
    await this.detailRepository.save(entities)
  }

  /**
   * Mark a single recipient's detail record (within a batch) as sent.
   */
  async markRecipientSent(
    notificationRequestId: string,
    batchId: string | null,
    recipientAddress: string,
    providerResponseId?: string,
  ): Promise<void> {
    await this.detailRepository.update(
      // A non-merge send has no batch, and one recipient has one row either way.
      { notificationRequestId, recipientAddress, ...(batchId ? { batchId } : {}) },
      {
        status: 'sent',
        lastAttemptAt: new Date(),
        updatedBy: 'system',
        ...(providerResponseId && { providerResponseId }),
      },
    )
  }

  /**
   * Mark a single recipient's detail record (within a batch) as failed.
   */
  async markRecipientFailed(
    notificationRequestId: string,
    batchId: string | null,
    recipientAddress: string,
    errorMessage: string,
  ): Promise<void> {
    await this.detailRepository.update(
      { notificationRequestId, recipientAddress, ...(batchId ? { batchId } : {}) },
      { status: 'failed', errorMessage, lastAttemptAt: new Date(), updatedBy: 'system' },
    )
  }

  /**
   * Count detail records for a request in a given status (used to reconcile the parent request).
   */
  async countByStatus(notificationRequestId: string, status: string): Promise<number> {
    return this.detailRepository.count({ where: { notificationRequestId, status } })
  }

  /**
   * Mark all request detail records for a request as sent.
   */
  async markSent(notificationRequestId: string, providerResponseId?: string): Promise<void> {
    await this.detailRepository.update(
      { notificationRequestId },
      {
        status: 'sent',
        lastAttemptAt: new Date(),
        updatedBy: 'system',
        ...(providerResponseId && { providerResponseId }),
      },
    )
  }

  // TODO - add route to update individual notification request detail as sent
  // need more info on what the smtp gateway returns on individual failure

  /**
   * Mark all request detail records for a request as failed. Only called on the final attempt.
   */
  async markFailed(notificationRequestId: string, errorMessage: string): Promise<void> {
    await this.detailRepository.update(
      { notificationRequestId },
      { status: 'failed', errorMessage, lastAttemptAt: new Date(), updatedBy: 'system' },
    )
  }

  // TODO - add route to update individual notification request detail as failed
  // need more info on what the smtp gateway returns on individual failure

  /**
   * Update the status of all detail records for a notification request.
   */
  async updateStatus(notificationRequestId: string, status: string): Promise<void> {
    await this.detailRepository.update({ notificationRequestId }, { status, updatedBy: 'system' })
  }

  /**
   * Increment attempt_count and reset status to pending before a retry attempt.
   */
  async resetForRetry(notificationRequestId: string): Promise<void> {
    // Only rows that have not been delivered. Resetting a sent row to pending would have the
    // retry send to that recipient a second time - which is the whole reason a partial failure
    // must not fail the job.
    const retryable: FindOptionsWhere<NotificationRequestDetail> = {
      notificationRequestId,
      status: Not('sent'),
    }
    await this.detailRepository.increment(retryable, 'attemptCount', 1)
    await this.detailRepository.update(retryable, {
      status: 'pending',
      lastAttemptAt: new Date(),
      updatedBy: 'system',
    })
  }

  /**
   * Retrieve all request detail records for a notification request belonging to a tenant.
   */
  async findByRequestId(
    notificationRequestId: string,
    tenantId: string,
  ): Promise<NotificationRequestDetail[]> {
    return this.detailRepository.find({
      where: { notificationRequestId, notificationRequest: { tenantId } },
      relations: { notificationRequest: true },
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * Retrieve request detail records for a notification request with sorting, filtering, search,
   * and pagination applied in the database.
   */
  async findByRequestIdPaginated(
    notificationRequestId: string,
    tenantId: string,
    parsedQuery: ParsedListQuery,
    search?: string,
  ): Promise<PaginatedNotificationRequestDetailResponse> {
    const queryBuilder = this.detailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.notificationRequest', 'request')
      .where('detail.notificationRequestId = :notificationRequestId', { notificationRequestId })
      .andWhere('request.tenantId = :tenantId', { tenantId })

    // search applies to recipients
    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&')
      queryBuilder.andWhere(`detail.recipientAddress ILIKE :search ESCAPE '\\'`, {
        search: `%${escaped}%`,
      })
    }

    applyParsedListQueryToQueryBuilder(
      queryBuilder,
      parsedQuery,
      notificationRequestDetailListQueryConfig,
    )
    const [details, total] = await queryBuilder.getManyAndCount()

    return {
      data: details.map((detail) => ({
        id: detail.id,
        notificationRequestId: detail.notificationRequestId,
        recipientAddress: detail.recipientAddress,
        channel: detail.channel,
        status: detail.status,
        providerResponseId: detail.providerResponseId,
        errorMessage: detail.errorMessage,
        attemptCount: detail.attemptCount,
        lastAttemptAt: detail.lastAttemptAt,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      })),
      count: total,
      page: parsedQuery.page,
      limit: parsedQuery.limit,
      totalPages: Math.ceil(total / parsedQuery.limit),
    }
  }

  /**
   * Get the user's tenant id and then retrieve request detail records for a notification request
   * belonging to a tenant with sorting and filtering.
   */
  async findByRequestIdFrontend(
    notificationRequestId: string,
    userId: string,
    parsedQuery: ParsedListQuery,
    search?: string,
  ): Promise<PaginatedNotificationRequestDetailResponse> {
    const tenant = await this.tenantsService.findByExternalId(userId)
    return this.findByRequestIdPaginated(notificationRequestId, tenant.id, parsedQuery, search)
  }

  /**
   * Retrieve all request detail records for a tenant, newest first.
   */
  async findAllByTenantId(tenantId: string): Promise<NotificationRequestDetail[]> {
    return this.detailRepository.find({
      where: { notificationRequest: { tenantId } },
      relations: { notificationRequest: true },
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * Extract channel code, recipients, and delayed send time from notification payload
   */
  private extractRecipients(
    payload: NotifySimpleRequest | ProcessedNotifySimpleRequest | undefined,
  ): {
    recipients: {
      email: { address: string; emailAddressType: 'primary' | 'cc' | 'bcc' }[]
      sms: string[]
      msgApp: string[]
    }
  } {
    if (!payload) {
      return { recipients: { email: [], sms: [], msgApp: [] } }
    }

    const recipients = {
      email: [] as { address: string; emailAddressType: 'primary' | 'cc' | 'bcc' }[],
      sms: [] as string[],
      msgApp: [] as string[],
    }

    if (payload.email) {
      recipients.email = [
        ...(payload.email.recipients?.to || []).map((address) => ({
          address,
          emailAddressType: 'primary' as const,
        })),
        ...(payload.email.recipients?.cc || []).map((address) => ({
          address,
          emailAddressType: 'cc' as const,
        })),
        ...(payload.email.recipients?.bcc || []).map((address) => ({
          address,
          emailAddressType: 'bcc' as const,
        })),
      ]
    }

    if (payload.sms) {
      recipients.sms = payload.sms.recipients?.to || []
    }

    if (payload.msgApp) {
      recipients.msgApp = payload.msgApp.recipients?.to || []
    }

    return {
      recipients,
    }
  }
}
