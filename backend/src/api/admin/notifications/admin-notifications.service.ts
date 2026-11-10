import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository, SelectQueryBuilder } from 'typeorm'
import { NotificationRequest } from '../../notification/entities/notification-request.entity'
import { NotificationRequestDetail } from '../../notification/entities/notification-request-detail.entity'
import type { ListQueryDto } from '../../../common/query/list-query.dto'
import { parseListQuery } from '../../../common/query/list-query.parser'
import { applyParsedListQueryToQueryBuilder } from '../../../common/query/typeorm-list-query.util'
import type { ListQueryFilter, QueryableFieldsConfig } from '../../../common/query/list-query.types'
import { redactRecipients, redactValue } from '../../../common/utils/redact-recipients'
import { lokiLogsUrl } from './loki-link'
import type {
  AdminDeliveryCountDto,
  AdminDeliveryDto,
  AdminNotificationDetailDto,
  AdminNotificationRowDto,
  AdminStatusChangeDto,
  PaginatedAdminDeliveryResponseDto,
  PaginatedAdminNotificationResponseDto,
} from './schemas/admin-notification.dto'

export const adminNotificationListQueryConfig: QueryableFieldsConfig = {
  sortableFields: { createdAt: 'n.createdAt' },
  filterableFields: {
    status: { column: 'n.status', valueType: 'string', operators: ['eq', 'in'] },
    tenantId: { column: 'n.tenantId', valueType: 'string', operators: ['eq', 'in'] },
    createdAt: { column: 'n.createdAt', valueType: 'date', operators: ['gte', 'lte'] },
    // channel_codes is a jsonb array, so it is applied separately; listed here to be validated.
    channel: { column: 'n.channelCodes', valueType: 'string', operators: ['in'] },
  },
  defaultSort: [{ field: 'createdAt', direction: 'DESC' }],
}

export const adminDeliveryListQueryConfig: QueryableFieldsConfig = {
  sortableFields: {
    status: 'd.status',
    attemptCount: 'd.attemptCount',
    lastAttemptAt: 'd.lastAttemptAt',
  },
  filterableFields: {
    status: { column: 'd.status', valueType: 'string', operators: ['eq', 'in'] },
    channel: { column: 'd.channel', valueType: 'string', operators: ['eq', 'in'] },
  },
}

/** Addresses listed on the request itself, in whichever channels it used. */
const LISTED_RECIPIENTS = ['email', 'sms', 'msgApp']
  .map(
    (key) =>
      `CASE WHEN jsonb_typeof(r.recipients->'${key}') = 'array' ` +
      `THEN jsonb_array_length(r.recipients->'${key}') ELSE 0 END`,
  )
  .join(' + ')

interface RecipientCounts {
  id: string
  deliveries: string
  failed: string
  listed: string
}

/**
 * Notification requests across every tenant, for admins troubleshooting a send. Nothing here
 * returns a recipient address or message content: addresses are read only to redact them.
 */
@Injectable()
export class AdminNotificationsService {
  constructor(
    @InjectRepository(NotificationRequest)
    private readonly requestRepository: Repository<NotificationRequest>,
    @InjectRepository(NotificationRequestDetail)
    private readonly detailRepository: Repository<NotificationRequestDetail>,
  ) {}

  async list(query: ListQueryDto, search?: string): Promise<PaginatedAdminNotificationResponseDto> {
    const parsed = parseListQuery(query, adminNotificationListQueryConfig)
    const qb = this.requests()
    const term = search?.trim()
    if (term) qb.andWhere('t.name ILIKE :search', { search: `%${term}%` })
    this.applyChannelFilter(qb, parsed.filters)
    applyParsedListQueryToQueryBuilder(
      qb,
      { ...parsed, filters: parsed.filters.filter((f) => f.field !== 'channel') },
      adminNotificationListQueryConfig,
    )
    qb.addOrderBy('n.id', 'DESC')

    const [requests, count] = await qb.getManyAndCount()
    const counts = await this.recipientCounts(requests.map((r) => r.id))
    return {
      data: requests.map((r) => this.toRow(r, counts.get(r.id))),
      count,
      page: parsed.page,
      limit: parsed.limit,
      totalPages: Math.ceil(count / parsed.limit),
    }
  }

  async findOne(id: string): Promise<AdminNotificationDetailDto> {
    const request = await this.requests()
      .addSelect(['n.updatedAt', 'n.errorReason', 'n.quarantineDetails', 'n.recipients'])
      .andWhere('n.id = :id', { id })
      .getOne()
    if (!request) throw new NotFoundException('Notification request not found')

    const [counts, deliveryCounts, statusHistory] = await Promise.all([
      this.recipientCounts([id]),
      this.deliveryCounts(id),
      this.statusHistory(id),
    ])
    const known = Object.values(request.recipients ?? {}).flat()
    const quarantine = request.quarantineDetails
    return {
      ...this.toRow(request, counts.get(id)),
      updatedAt: request.updatedAt.toISOString(),
      errorReason: redactValue(request.errorReason, known),
      // The infected file's name is left out: it can name the person the message was about.
      quarantine: quarantine
        ? {
            viruses: quarantine.viruses,
            reason: quarantine.reason,
            scannedAt: quarantine.scannedAt,
          }
        : null,
      deliveryCounts,
      statusHistory,
      logsUrl: lokiLogsUrl(id, request.createdAt, request.updatedAt),
    }
  }

  async listDeliveries(
    id: string,
    query: ListQueryDto,
  ): Promise<PaginatedAdminDeliveryResponseDto> {
    const parsed = parseListQuery(query, adminDeliveryListQueryConfig)
    const qb = this.detailRepository
      .createQueryBuilder('d')
      .select([
        'd.id',
        'd.channel',
        'd.status',
        'd.attemptCount',
        'd.lastAttemptAt',
        'd.errorMessage',
        'd.providerResponseId',
        'd.providerResponse',
        'd.recipientAddress',
      ])
      .where('d.notificationRequestId = :id', { id })
    applyParsedListQueryToQueryBuilder(qb, parsed, adminDeliveryListQueryConfig)
    qb.addOrderBy('d.createdAt', 'ASC').addOrderBy('d.id', 'ASC')

    const [rows, count] = await qb.getManyAndCount()
    return {
      data: rows.map((row) => this.toDelivery(row)),
      count,
      page: parsed.page,
      limit: parsed.limit,
      totalPages: Math.ceil(count / parsed.limit),
    }
  }

  /** Columns for a row; recipients and payload are never selected here. */
  private requests(): SelectQueryBuilder<NotificationRequest> {
    return this.requestRepository
      .createQueryBuilder('n')
      .innerJoin('n.tenant', 't')
      .leftJoin('n.statusCode', 's')
      .select([
        'n.id',
        'n.tenantId',
        'n.status',
        'n.channelCodes',
        'n.requestRoute',
        'n.createdAt',
        'n.delayedSendTime',
        't.id',
        't.name',
        's.code',
        's.displayName',
      ])
      .where('n.isInternal = :internal', { internal: false })
  }

  private applyChannelFilter(
    qb: SelectQueryBuilder<NotificationRequest>,
    filters: ListQueryFilter[],
  ): void {
    const channels = filters.find((f) => f.field === 'channel')?.value
    if (!Array.isArray(channels) || channels.length === 0) return
    qb.andWhere('jsonb_exists_any(n.channel_codes, ARRAY[:...channels]::text[])', {
      channels: channels.map(String),
    })
  }

  private async recipientCounts(ids: string[]): Promise<Map<string, RecipientCounts>> {
    if (ids.length === 0) return new Map()
    const rows: RecipientCounts[] = await this.requestRepository.query(
      `SELECT r.id,
              (SELECT COUNT(*) FROM notify.notification_request_detail d
                WHERE d.notification_request_id = r.id) AS deliveries,
              (SELECT COUNT(*) FROM notify.notification_request_detail d
                WHERE d.notification_request_id = r.id AND d.status = 'failed') AS failed,
              ${LISTED_RECIPIENTS} AS listed
         FROM notify.notification_request r
        WHERE r.id = ANY($1::uuid[])`,
      [ids],
    )
    return new Map(rows.map((row) => [row.id, row]))
  }

  private async deliveryCounts(id: string): Promise<AdminDeliveryCountDto[]> {
    const rows: Array<{ channel: string; status: string; count: string }> =
      await this.detailRepository
        .createQueryBuilder('d')
        .select('d.channel', 'channel')
        .addSelect('d.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('d.notificationRequestId = :id', { id })
        .groupBy('d.channel')
        .addGroupBy('d.status')
        .orderBy('d.channel', 'ASC')
        .addOrderBy('d.status', 'ASC')
        .getRawMany()
    return rows.map((row) => ({ ...row, count: Number(row.count) }))
  }

  /** Each status the request moved through, from its audit history, oldest first. */
  private async statusHistory(id: string): Promise<AdminStatusChangeDto[]> {
    const rows: Array<{ status: string | null; at: Date }> = await this.requestRepository.query(
      `SELECT data_after_operation->>'status' AS status, operation_executed_at AS at
         FROM notify.notification_request_history
        WHERE target_row_id = $1
        ORDER BY operation_executed_at, h_id`,
      [id],
    )
    const changes: AdminStatusChangeDto[] = []
    for (const row of rows) {
      // Most updates touch other columns; only a change of status is a step in the history.
      if (!row.status || changes.at(-1)?.status === row.status) continue
      changes.push({ status: row.status, at: new Date(row.at).toISOString() })
    }
    return changes
  }

  private toRow(request: NotificationRequest, counts?: RecipientCounts): AdminNotificationRowDto {
    const deliveries = Number(counts?.deliveries ?? 0)
    return {
      id: request.id,
      tenantId: request.tenantId,
      tenantName: request.tenant?.name ?? '',
      status: {
        code: request.status,
        displayName: request.statusCode?.displayName ?? request.status,
      },
      channels: request.channelCodes ?? [],
      requestRoute: request.requestRoute ?? null,
      createdAt: request.createdAt.toISOString(),
      scheduledFor: request.delayedSendTime?.toISOString() ?? null,
      // Before ingestion there are no deliveries yet, so count the addresses on the request.
      recipientCount: deliveries > 0 ? deliveries : Number(counts?.listed ?? 0),
      failedCount: Number(counts?.failed ?? 0),
    }
  }

  private toDelivery(row: NotificationRequestDetail): AdminDeliveryDto {
    const known = [row.recipientAddress]
    return {
      id: row.id,
      channel: row.channel,
      status: row.status,
      attemptCount: row.attemptCount,
      lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
      errorMessage: row.errorMessage ? redactRecipients(row.errorMessage, known) : null,
      providerResponseId: row.providerResponseId ?? null,
      providerResponse: redactValue(row.providerResponse, known),
    }
  }
}
