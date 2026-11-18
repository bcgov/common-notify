import type { FC, ReactNode } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import TenantRequestStatusBadge, {
  tenantRequestStatusLabel,
} from '@/components/TenantRequestStatusBadge'
import type { TenantRequest } from '@/api/tenantRequests.api'
import { formatDate } from '@/utils/dates'
import '@/scss/components/tenant-request-card.scss'

/** Finished requests: nothing more can happen to them, so the tenant may clear them away. */
const DISMISSABLE_STATUSES = new Set(['rejected', 'cancelled', 'released'])

export const isDismissableTenantRequest = (request: TenantRequest): boolean =>
  DISMISSABLE_STATUSES.has(request.statusCode)

interface RequestEvent {
  verb: string
  by: string | null
  at: string
}

/** The last thing that happened to a request after it was made, if anything has. */
function latestEvent(request: TenantRequest): RequestEvent | null {
  switch (request.statusCode) {
    case 'rejected':
    case 'approved':
      return request.decidedAt
        ? {
            verb: tenantRequestStatusLabel(request.statusCode),
            by: request.decidedBy,
            at: request.decidedAt,
          }
        : null
    case 'cancelled':
      return request.cancelledAt
        ? { verb: 'Cancelled', by: request.cancelledBy, at: request.cancelledAt }
        : null
    case 'released':
      return request.releasedAt
        ? { verb: 'Released', by: request.releasedBy, at: request.releasedAt }
        : null
    default:
      return null
  }
}

/** "Rejected by Pat Admin on Nov 18, 2026". */
const EventLine: FC<RequestEvent> = ({ verb, by, at }) => (
  <p className="tenant-request-card__meta">
    {verb}
    {by ? ` by ${by}` : ''} on <time dateTime={at}>{formatDate(at)}</time>
  </p>
)

interface TenantRequestCardProps {
  request: TenantRequest
  /** What was asked for, e.g. "Number request". */
  typeLabel: string
  /** What the request means for the tenant now, from the request's type. */
  details?: ReactNode
  /** The main action open to the tenant, e.g. a cancel or request-again button. */
  action?: ReactNode
  /** Clears a finished request away. Offered only for a rejected, cancelled or released one. */
  onDismiss?: () => void
  isBusy?: boolean
}

/**
 * A tenant's own request, as its settings show it: the status, who made it and who last acted
 * on it, an admin's reason for a rejection, and the actions open to the tenant. Shared by every
 * request type; the type supplies the details and the action.
 */
const TenantRequestCard: FC<TenantRequestCardProps> = ({
  request,
  typeLabel,
  details,
  action,
  onDismiss,
  isBusy = false,
}) => {
  const event = latestEvent(request)
  const statusLabel = tenantRequestStatusLabel(request.statusCode).toLowerCase()
  const showDismiss = onDismiss && isDismissableTenantRequest(request)
  const showReason = request.statusCode === 'rejected' && request.decisionReason

  return (
    <div className="tenant-request-card">
      <div className="tenant-request-card__header">
        <TenantRequestStatusBadge status={request.statusCode} />
        <span className="tenant-request-card__type">
          <span aria-hidden="true">· </span>
          {typeLabel}
        </span>
        {showDismiss && (
          <span className="tenant-request-card__dismiss">
            <Button
              type="button"
              variant="tertiary"
              size="small"
              isDisabled={isBusy}
              aria-label={`Dismiss ${statusLabel} request`}
              onPress={onDismiss}
            >
              Dismiss
            </Button>
          </span>
        )}
      </div>
      <p className="tenant-request-card__meta">
        Requested{request.requestedBy ? ` by ${request.requestedBy}` : ''} on{' '}
        <time dateTime={request.requestedAt}>{formatDate(request.requestedAt)}</time>
      </p>
      {event && <EventLine {...event} />}
      {showReason && (
        <blockquote className="tenant-request-card__reason">{request.decisionReason}</blockquote>
      )}
      {details && <p className="tenant-request-card__details">{details}</p>}
      {action && <div className="tenant-request-card__actions">{action}</div>}
    </div>
  )
}

export default TenantRequestCard
