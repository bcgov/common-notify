import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { escapeLikePattern } from '../../common/query/typeorm-list-query.util'
import { TenantRequest } from './entities/tenant-request.entity'
import { TenantRequestHistory } from './entities/tenant-request-history.entity'
import { RequestActor, TenantRequestStatus } from './tenant-request-codes'
import { TenantRequestHandlerRegistry } from './tenant-request-handler.registry'
import {
  PaginatedTenantRequestsDto,
  TenantRequestCodeDto,
  TenantRequestCodesDto,
  TenantRequestDto,
} from './schemas/tenant-request.dto'

/** What the admin requests table asks for: one page, some types and statuses, a tenant search. */
export interface TenantRequestListQuery {
  types?: string[]
  statuses?: string[]
  search?: string
  page?: number
  limit?: number
}

/** Postgres unique_violation: here, a second pending request of a type for a tenant. */
const UNIQUE_VIOLATION = '23505'

const REQUEST_COLUMNS = `
  r.id, r.tenant_id, t.name AS tenant_name, r.request_type_code, r.status_code,
  r.created_by_name, r.created_by, r.created_at,
  r.decided_by_name, r.decided_by, r.decided_at, r.decision_reason,
  r.released_by_name, r.released_by, r.released_at,
  r.cancelled_by_name, r.cancelled_by, r.cancelled_at`

const REQUEST_FROM = `
  FROM notify.tenant_request r
  JOIN notify.tenant t ON t.id = r.tenant_id`

interface RequestRow {
  id: string
  tenant_id: string
  tenant_name: string
  request_type_code: string
  status_code: string
  created_by_name: string | null
  created_by: string | null
  created_at: Date
  decided_by_name: string | null
  decided_by: string | null
  decided_at: Date | null
  decision_reason: string | null
  released_by_name: string | null
  released_by: string | null
  released_at: Date | null
  cancelled_by_name: string | null
  cancelled_by: string | null
  cancelled_at: Date | null
}

/** Statuses that follow an approval, so have an outcome to describe. */
const GRANTED_STATUSES = new Set<string>([
  TenantRequestStatus.APPROVED,
  TenantRequestStatus.RELEASED,
])

/**
 * Tenants' requests for things a Notify admin must approve. A tenant asks; an admin approves it,
 * which the type's handler carries out, or rejects it with a reason. The tenant can cancel it while
 * it is pending. Once approved, what it granted can be released. A tenant has at most one pending
 * request of each type.
 */
@Injectable()
export class TenantRequestsService {
  constructor(
    @InjectRepository(TenantRequest)
    private readonly requestRepository: Repository<TenantRequest>,
    private readonly handlers: TenantRequestHandlerRegistry,
  ) {}

  /** The request types with a handler, and every status, for the admin table's filters. */
  async getCodes(): Promise<TenantRequestCodesDto> {
    const read = (table: string): Promise<TenantRequestCodeDto[]> =>
      this.requestRepository.query(`SELECT code, description FROM notify.${table} ORDER BY code`)
    const [types, statuses] = await Promise.all([
      read('tenant_request_type_code'),
      read('tenant_request_status_code'),
    ])
    const handled = new Set(this.handlers.all().map((handler) => handler.type))
    return { types: types.filter((type) => handled.has(type.code)), statuses }
  }

  /** The tenant's most recent request of a type, or null if it has never made one. */
  async findLatestForTenant(tenantId: string, type: string): Promise<TenantRequestDto | null> {
    const rows: RequestRow[] = await this.requestRepository.query(
      `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM}
        WHERE r.tenant_id = $1 AND r.request_type_code = $2
        ORDER BY r.created_at DESC
        LIMIT 1`,
      [tenantId, type],
    )
    return (await this.toDtos(rows))[0] ?? null
  }

  /**
   * A page of requests, newest first. Empty `types` or `statuses` means every one; `search`
   * matches tenant names, case-insensitively.
   */
  async list(query: TenantRequestListQuery = {}): Promise<PaginatedTenantRequestsDto> {
    const page = query.page ?? 1
    const limit = query.limit ?? 10
    const search = query.search?.trim()
    const where = String.raw`WHERE (cardinality($1::text[]) = 0 OR r.status_code = ANY($1))
                     AND (cardinality($2::text[]) = 0 OR r.request_type_code = ANY($2))
                     AND ($3::text IS NULL OR t.name ILIKE $3 ESCAPE '\')`
    const params = [
      query.statuses ?? [],
      query.types ?? [],
      search ? `%${escapeLikePattern(search)}%` : null,
    ]

    const [rows, [{ total }]]: [RequestRow[], Array<{ total: string }>] = await Promise.all([
      this.requestRepository.query(
        `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} ${where}
          ORDER BY r.created_at DESC, r.id
          LIMIT $4 OFFSET $5`,
        [...params, limit, (page - 1) * limit],
      ),
      this.requestRepository.query(`SELECT count(*) AS total ${REQUEST_FROM} ${where}`, params),
    ])
    const count = Number(total)
    const data = await this.toDtos(rows)
    return { data, count, page, limit, totalPages: Math.ceil(count / limit) }
  }

  async findById(id: string): Promise<TenantRequestDto> {
    const rows: RequestRow[] = await this.requestRepository.query(
      `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} WHERE r.id = $1`,
      [id],
    )
    const [request] = await this.toDtos(rows)
    if (!request) throw new NotFoundException(`Request ${id} not found`)
    return request
  }

  async create(tenantId: string, type: string, actor: RequestActor): Promise<TenantRequestDto> {
    // Refuses a type nothing can approve.
    this.handlers.get(type)
    try {
      const id = await this.requestRepository.manager.transaction(async (manager) => {
        const saved = await manager.save(
          manager.create(TenantRequest, {
            tenantId,
            requestTypeCode: type,
            statusCode: TenantRequestStatus.PENDING,
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
        throw new ConflictException('This tenant already has a pending request of this type')
      }
      throw error
    }
  }

  /**
   * Cancels the tenant's own request while it is still pending, so it can ask again. With
   * `type`, a request of another type is reported as missing.
   */
  async cancel(
    tenantId: string,
    requestId: string,
    actor: RequestActor,
    type?: string,
  ): Promise<TenantRequestDto> {
    await this.requestRepository.manager.transaction(async (manager) => {
      const request = await lockRequest(manager, requestId, { tenantId, type })
      if (request.statusCode !== TenantRequestStatus.PENDING) {
        throw new ConflictException(`This request has already been ${request.statusCode}`)
      }
      request.statusCode = TenantRequestStatus.CANCELLED
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
   * Takes back what an approved request granted, through its type's handler. With an `owner`
   * (a tenant releasing its own), another tenant's request, or one of another type, is reported
   * as missing.
   */
  async release(
    requestId: string,
    actor: RequestActor,
    owner?: { tenantId: string; type: string },
  ): Promise<TenantRequestDto> {
    await this.requestRepository.manager.transaction(async (manager) => {
      const request = await lockRequest(manager, requestId, owner ?? {})
      if (request.statusCode !== TenantRequestStatus.APPROVED) {
        throw new ConflictException('Only an approved request can be released')
      }
      await this.handlers.get(request.requestTypeCode).release(manager, request, actor)
      await this.markReleased(manager, [request.id], actor)
    })
    return this.findById(requestId)
  }

  /**
   * Marks approved requests released, with a history row each, within the caller's transaction.
   * For a handler whose grant was taken back outside the workflow, e.g. an admin unassigning a
   * number directly. Requests no longer approved are left as they are.
   */
  async markReleased(
    manager: EntityManager,
    requestIds: readonly string[],
    actor: RequestActor,
  ): Promise<void> {
    if (requestIds.length === 0) return
    // The request and its history row in one statement, so neither is written without the other.
    await manager.query(
      `WITH released AS (
         UPDATE notify.tenant_request
            SET status_code = $2, released_by = $3, released_by_name = $4, released_at = NOW(),
                updated_at = NOW(), updated_by = $3
          WHERE id = ANY($1::uuid[]) AND status_code = $5
          RETURNING id
       )
       INSERT INTO notify.tenant_request_history
              (tenant_request_id, status_code, created_by, created_by_name)
       SELECT id, $2, $3, $4 FROM released`,
      [
        requestIds,
        TenantRequestStatus.RELEASED,
        actor.id,
        actor.name,
        TenantRequestStatus.APPROVED,
      ],
    )
  }

  /**
   * Approves a pending request: its type's handler grants what was asked for, using the admin's
   * `options`, in the same transaction as the decision.
   */
  async approve(
    requestId: string,
    options: Record<string, unknown>,
    actor: RequestActor,
  ): Promise<TenantRequestDto> {
    return this.decide(requestId, actor, async (request, manager) => {
      await this.handlers.get(request.requestTypeCode).approve(manager, request, options, actor)
      request.statusCode = TenantRequestStatus.APPROVED
    })
  }

  async reject(requestId: string, reason: string, actor: RequestActor): Promise<TenantRequestDto> {
    return this.decide(requestId, actor, async (request) => {
      request.statusCode = TenantRequestStatus.REJECTED
      request.decisionReason = reason
    })
  }

  /**
   * Moves a pending request to its decided state. The row is locked first, so two admins deciding
   * at the same moment cannot both succeed.
   */
  private async decide(
    requestId: string,
    actor: RequestActor,
    apply: (request: TenantRequest, manager: EntityManager) => Promise<void>,
  ): Promise<TenantRequestDto> {
    await this.requestRepository.manager.transaction(async (manager) => {
      const request = await lockRequest(manager, requestId, {})
      if (request.statusCode !== TenantRequestStatus.PENDING) {
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

  /** Rows as the API returns them, with each granted request's outcome from its type's handler. */
  private async toDtos(rows: RequestRow[]): Promise<TenantRequestDto[]> {
    const outcomes = await this.describeOutcomes(rows)
    return rows.map((row) => toDto(row, outcomes.get(row.id) ?? null))
  }

  private async describeOutcomes(rows: RequestRow[]): Promise<Map<string, string>> {
    const idsByType = new Map<string, string[]>()
    for (const row of rows.filter((r) => GRANTED_STATUSES.has(r.status_code))) {
      idsByType.set(row.request_type_code, [
        ...(idsByType.get(row.request_type_code) ?? []),
        row.id,
      ])
    }
    // A type with no handler any more still lists, just without an outcome.
    const described = await Promise.all(
      [...idsByType].map(
        ([type, ids]) =>
          this.handlers.find(type)?.describeOutcomes(this.requestRepository.manager, ids) ??
          new Map<string, string>(),
      ),
    )
    return new Map(described.flatMap((outcomes) => [...outcomes]))
  }
}

/**
 * Reads and locks a request. One belonging to another tenant, or of another type, than the
 * caller asked about is reported as missing, not forbidden.
 */
async function lockRequest(
  manager: EntityManager,
  requestId: string,
  scope: { tenantId?: string; type?: string },
): Promise<TenantRequest> {
  const request = await manager.findOne(TenantRequest, {
    where: { id: requestId },
    lock: { mode: 'pessimistic_write' },
  })
  const outOfScope =
    (scope.tenantId && request?.tenantId !== scope.tenantId) ||
    (scope.type && request?.requestTypeCode !== scope.type)
  if (!request || outOfScope) throw new NotFoundException(`Request ${requestId} not found`)
  return request
}

/** The audit row for the status a request has just entered. */
async function recordHistory(
  manager: EntityManager,
  request: TenantRequest,
  actor: RequestActor,
): Promise<void> {
  await manager.insert(TenantRequestHistory, {
    tenantRequestId: request.id,
    statusCode: request.statusCode,
    reason: request.decisionReason ?? null,
    createdBy: actor.id,
    createdByName: actor.name,
  })
}

const isoOrNull = (value: Date | null): string | null =>
  value ? new Date(value).toISOString() : null

function toDto(row: RequestRow, outcome: string | null): TenantRequestDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    requestTypeCode: row.request_type_code,
    statusCode: row.status_code,
    requestedBy: row.created_by_name ?? row.created_by,
    requestedAt: new Date(row.created_at).toISOString(),
    decidedBy: row.decided_by_name ?? row.decided_by,
    decidedAt: isoOrNull(row.decided_at),
    decisionReason: row.decision_reason,
    outcome,
    releasedBy: row.released_by_name ?? row.released_by,
    releasedAt: isoOrNull(row.released_at),
    cancelledBy: row.cancelled_by_name ?? row.cancelled_by,
    cancelledAt: isoOrNull(row.cancelled_at),
  }
}
