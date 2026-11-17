import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { SmsNumberRequest } from './entities/sms-number-request.entity'
import { SmsNumberRequestHistory } from './entities/sms-number-request-history.entity'
import { SmsNumberRequestStatus } from './sms-number-codes'
import { SmsNumberActor, SmsNumbersService } from './sms-numbers.service'
import { PaginatedSmsNumberRequestsDto, SmsNumberRequestDto } from './schemas/sms-number.dto'
import { escapeLikePattern } from '../../common/query/typeorm-list-query.util'

/** What the admin requests table asks for: one page, some statuses, a tenant search. */
export interface SmsNumberRequestListQuery {
  statuses?: string[]
  search?: string
  page?: number
  limit?: number
}

/** Postgres unique_violation: here, a second pending request for a tenant. */
const UNIQUE_VIOLATION = '23505'

const REQUEST_COLUMNS = `
  r.id, r.tenant_id, t.name AS tenant_name, r.status_code, r.created_by_name, r.created_by,
  r.created_at, r.decided_by_name, r.decided_by, r.decided_at, r.decision_reason, n.phone_number,
  r.sms_number_id,
  r.released_by_name, r.released_by, r.released_at,
  r.cancelled_by_name, r.cancelled_by, r.cancelled_at`

const REQUEST_FROM = `
  FROM notify.sms_number_request r
  JOIN notify.tenant t ON t.id = r.tenant_id
  LEFT JOIN notify.sms_number n ON n.id = r.sms_number_id`

interface RequestRow {
  id: string
  tenant_id: string
  tenant_name: string
  status_code: string
  created_by_name: string | null
  created_by: string | null
  created_at: Date
  decided_by_name: string | null
  decided_by: string | null
  decided_at: Date | null
  decision_reason: string | null
  phone_number: string | null
  sms_number_id: string | null
  released_by_name: string | null
  released_by: string | null
  released_at: Date | null
  cancelled_by_name: string | null
  cancelled_by: string | null
  cancelled_at: Date | null
}

/**
 * Tenants' requests for an SMS number. A tenant asks; a Notify admin approves it by assigning a
 * number, or rejects it with a reason. Once approved, a Notify admin or the tenant's operations
 * admin can release the number. The tenant can cancel it while it is pending. A tenant has at
 * most one pending request. Requests do not gate sending.
 */
@Injectable()
export class SmsNumberRequestsService {
  constructor(
    @InjectRepository(SmsNumberRequest)
    private readonly requestRepository: Repository<SmsNumberRequest>,
    private readonly smsNumbersService: SmsNumbersService,
  ) {}

  /** The tenant's most recent request, or null if it has never made one. */
  async findLatestForTenant(tenantId: string): Promise<SmsNumberRequestDto | null> {
    const rows: RequestRow[] = await this.requestRepository.query(
      `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM}
        WHERE r.tenant_id = $1
        ORDER BY r.created_at DESC
        LIMIT 1`,
      [tenantId],
    )
    return rows[0] ? toDto(rows[0]) : null
  }

  /**
   * A page of requests, newest first. `statuses` empty means every status; `search` matches
   * tenant names, case-insensitively.
   */
  async list(query: SmsNumberRequestListQuery = {}): Promise<PaginatedSmsNumberRequestsDto> {
    const page = query.page ?? 1
    const limit = query.limit ?? 10
    const search = query.search?.trim()
    const where = String.raw`WHERE (cardinality($1::text[]) = 0 OR r.status_code = ANY($1))
                     AND ($2::text IS NULL OR t.name ILIKE $2 ESCAPE '\')`
    const params = [query.statuses ?? [], search ? `%${escapeLikePattern(search)}%` : null]

    const [rows, [{ total }]]: [RequestRow[], Array<{ total: string }>] = await Promise.all([
      this.requestRepository.query(
        `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} ${where}
          ORDER BY r.created_at DESC, r.id
          LIMIT $3 OFFSET $4`,
        [...params, limit, (page - 1) * limit],
      ),
      this.requestRepository.query(`SELECT count(*) AS total ${REQUEST_FROM} ${where}`, params),
    ])
    const count = Number(total)
    return { data: rows.map(toDto), count, page, limit, totalPages: Math.ceil(count / limit) }
  }

  async create(tenantId: string, actor: SmsNumberActor): Promise<SmsNumberRequestDto> {
    try {
      const id = await this.requestRepository.manager.transaction(async (manager) => {
        const saved = await manager.save(
          manager.create(SmsNumberRequest, {
            tenantId,
            statusCode: SmsNumberRequestStatus.PENDING,
            createdBy: actor.id,
            createdByName: actor.name,
            updatedBy: actor.id,
          }),
        )
        await recordHistory(manager, saved, actor)
        return saved.id
      })
      return await this.findById(id)
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('This tenant already has a pending SMS number request')
      }
      throw error
    }
  }

  /** Cancels the tenant's own request while it is still pending, so it can ask again. */
  async cancel(
    tenantId: string,
    requestId: string,
    actor: SmsNumberActor,
  ): Promise<SmsNumberRequestDto> {
    await this.requestRepository.manager.transaction(async (manager) => {
      const request = await this.lockRequest(manager, requestId, tenantId)
      if (request.statusCode !== SmsNumberRequestStatus.PENDING) {
        throw new ConflictException(`This request has already been ${request.statusCode}`)
      }
      request.statusCode = SmsNumberRequestStatus.CANCELLED
      request.cancelledBy = actor.id
      request.cancelledByName = actor.name
      request.cancelledAt = new Date()
      request.updatedBy = actor.id
      await manager.save(request)
      await recordHistory(manager, request, actor)
    })
    return this.findById(requestId)
  }

  /**
   * Releases the number an approved request assigned: the tenant stops sending from it. With
   * `ownerTenantId` (a tenant releasing its own), another tenant's request is reported as missing.
   */
  async release(
    requestId: string,
    actor: SmsNumberActor,
    ownerTenantId?: string,
  ): Promise<SmsNumberRequestDto> {
    await this.requestRepository.manager.transaction(async (manager) => {
      const request = await this.lockRequest(manager, requestId, ownerTenantId)
      if (request.statusCode !== SmsNumberRequestStatus.APPROVED) {
        throw new ConflictException(`Only an approved request's number can be released`)
      }
      if (request.smsNumberId) {
        // Marks this request released, along with the assignment it made.
        await this.smsNumbersService.release(manager, request.tenantId, request.smsNumberId, actor)
        return
      }
      // Approved on the default number: nothing was assigned, so only the request changes.
      request.statusCode = SmsNumberRequestStatus.RELEASED
      request.releasedBy = actor.id
      request.releasedByName = actor.name
      request.releasedAt = new Date()
      request.updatedBy = actor.id
      await manager.save(request)
      await recordHistory(manager, request, actor)
    })
    return this.findById(requestId)
  }

  /**
   * Approves a pending request by assigning the tenant the given number, in one transaction. A null
   * number approves it on the service-wide default number, which only non-prod environments allow:
   * there every tenant sends from it, but the request still goes through approval.
   */
  async approve(
    requestId: string,
    smsNumberId: string | null,
    actor: SmsNumberActor,
  ): Promise<SmsNumberRequestDto> {
    if (smsNumberId === null && !this.smsNumbersService.defaultNumberAssignable()) {
      throw new BadRequestException('The default number cannot be assigned in this environment')
    }
    return this.decide(requestId, actor, async (request, manager) => {
      if (smsNumberId !== null) {
        await this.smsNumbersService.assign(request.tenantId, smsNumberId, actor, manager)
      }
      request.statusCode = SmsNumberRequestStatus.APPROVED
      request.smsNumberId = smsNumberId
    })
  }

  async reject(
    requestId: string,
    reason: string,
    actor: SmsNumberActor,
  ): Promise<SmsNumberRequestDto> {
    return this.decide(requestId, actor, async (request) => {
      request.statusCode = SmsNumberRequestStatus.REJECTED
      request.decisionReason = reason
    })
  }

  /**
   * Moves a pending request to its decided state. The row is locked first, so two admins deciding
   * at the same moment cannot both succeed.
   */
  private async decide(
    requestId: string,
    actor: SmsNumberActor,
    apply: (request: SmsNumberRequest, manager: EntityManager) => Promise<void>,
  ): Promise<SmsNumberRequestDto> {
    await this.requestRepository.manager.transaction(async (manager) => {
      const request = await this.lockRequest(manager, requestId)
      if (request.statusCode !== SmsNumberRequestStatus.PENDING) {
        throw new ConflictException(`This request has already been ${request.statusCode}`)
      }
      await apply(request, manager)
      request.decidedBy = actor.id
      request.decidedByName = actor.name
      request.decidedAt = new Date()
      request.updatedBy = actor.id
      await manager.save(request)
      await recordHistory(manager, request, actor)
    })
    return this.findById(requestId)
  }

  /** Reads and locks a request. Another tenant's is reported as missing, not forbidden. */
  private async lockRequest(
    manager: EntityManager,
    requestId: string,
    ownerTenantId?: string,
  ): Promise<SmsNumberRequest> {
    const request = await manager.findOne(SmsNumberRequest, {
      where: { id: requestId },
      lock: { mode: 'pessimistic_write' },
    })
    if (!request || (ownerTenantId && request.tenantId !== ownerTenantId)) {
      throw new NotFoundException(`SMS number request ${requestId} not found`)
    }
    return request
  }

  private async findById(id: string): Promise<SmsNumberRequestDto> {
    const rows: RequestRow[] = await this.requestRepository.query(
      `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} WHERE r.id = $1`,
      [id],
    )
    if (!rows[0]) throw new NotFoundException(`SMS number request ${id} not found`)
    return toDto(rows[0])
  }
}

/** The audit row for the status a request has just entered. */
async function recordHistory(
  manager: EntityManager,
  request: SmsNumberRequest,
  actor: SmsNumberActor,
): Promise<void> {
  await manager.insert(SmsNumberRequestHistory, {
    smsNumberRequestId: request.id,
    statusCode: request.statusCode,
    reason: request.decisionReason ?? null,
    smsNumberId: request.smsNumberId ?? null,
    createdBy: actor.id,
    createdByName: actor.name,
  })
}

/** Statuses a request reaches through approval, so a missing number means the default one. */
const DEFAULT_NUMBER_STATUSES = new Set<string>([
  SmsNumberRequestStatus.APPROVED,
  SmsNumberRequestStatus.RELEASED,
])

function toDto(row: RequestRow): SmsNumberRequestDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    statusCode: row.status_code,
    requestedBy: row.created_by_name ?? row.created_by,
    requestedAt: new Date(row.created_at).toISOString(),
    decidedBy: row.decided_by_name ?? row.decided_by,
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    decisionReason: row.decision_reason,
    phoneNumber: row.phone_number,
    usesDefaultNumber: row.sms_number_id === null && DEFAULT_NUMBER_STATUSES.has(row.status_code),
    releasedBy: row.released_by_name ?? row.released_by,
    releasedAt: row.released_at ? new Date(row.released_at).toISOString() : null,
    cancelledBy: row.cancelled_by_name ?? row.cancelled_by,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
  }
}
