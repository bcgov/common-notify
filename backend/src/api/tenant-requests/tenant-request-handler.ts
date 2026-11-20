import type { EntityManager } from 'typeorm'
import type { TenantRequest } from './entities/tenant-request.entity'
import type { RequestActor } from './tenant-request-codes'

/**
 * What one type of tenant request does when an admin decides it. The workflow (statuses, who and
 * when, history, locking) is TenantRequestsService's; a handler supplies only what differs by type.
 * Each method runs inside the workflow's transaction, so a failure leaves the request as it was.
 */
export interface TenantRequestHandler {
  /** The request_type_code it handles. */
  readonly type: string

  /**
   * Grants what was asked for. `options` is what the admin chose in the approval dialog, as sent:
   * the handler validates it, throwing a BadRequestException for anything it cannot use.
   */
  approve(
    manager: EntityManager,
    request: TenantRequest,
    options: Record<string, unknown>,
    actor: RequestActor,
  ): Promise<void>

  /** Takes back what approval granted. */
  release(manager: EntityManager, request: TenantRequest, actor: RequestActor): Promise<void>

  /**
   * A short account of what each approved or released request was granted, e.g. the number
   * assigned, keyed by request id. Requests with nothing to say are left out.
   */
  describeOutcomes(manager: EntityManager, requestIds: string[]): Promise<Map<string, string>>
}
