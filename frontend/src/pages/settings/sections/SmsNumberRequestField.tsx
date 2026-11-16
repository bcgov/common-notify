import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import ConfirmDialog from '@/components/ConfirmDialog'
import SmsRequestStatusBadge from '@/components/SmsRequestStatusBadge'
import {
  cancelMySmsNumberRequest,
  getMySmsNumberRequest,
  releaseMySmsNumber,
  requestSmsNumber,
} from '@/api/smsNumbers.api'
import type { SmsNumberRequest } from '@/api/smsNumbers.api'
import { useAppSelector } from '@/redux/hooks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { formatDate } from '@/utils/dates'
import '@/scss/components/sms-number-request-field.scss'

interface SmsNumberRequestFieldProps {
  /** Whether the user may request or release a number (NOTIFY_OPERATIONS_ADMIN). */
  canEdit: boolean
}

/** What a request's status means for the tenant. */
function describe(request: SmsNumberRequest): string {
  switch (request.statusCode) {
    case 'pending':
      return `Requested${request.requestedBy ? ` by ${request.requestedBy}` : ''} on ${formatDate(request.requestedAt)}. A Notify administrator will review it.`
    case 'approved':
      return request.usesDefaultNumber
        ? 'Your SMS is sent from the shared Notify number in this environment.'
        : `Your SMS is sent from ${request.phoneNumber ?? 'your assigned number'}.`
    case 'rejected':
      return request.decisionReason ?? 'Your request was not approved.'
    case 'cancelled':
      return `Cancelled${request.cancelledBy ? ` by ${request.cancelledBy}` : ''}${request.cancelledAt ? ` on ${formatDate(request.cancelledAt)}` : ''}. SMS is sent from the shared Notify number.`
    case 'released':
      return `${request.phoneNumber ?? 'Your number'} was released${request.releasedAt ? ` on ${formatDate(request.releasedAt)}` : ''}. SMS is sent from the shared Notify number.`
    default:
      return ''
  }
}

/** The one action open to the tenant: cancel while pending, release once approved, else ask. */
function actionLabel(request: SmsNumberRequest | null): string {
  switch (request?.statusCode) {
    case 'pending':
      return 'Cancel request'
    case 'approved':
      return 'Release number'
    case undefined:
      return 'Request an SMS number'
    default:
      return 'Request another number'
  }
}

function actionFor(
  request: SmsNumberRequest | null,
  handlers: {
    cancel: (pending: SmsNumberRequest) => void
    release: () => void
    request: () => void
  },
): () => void {
  if (request?.statusCode === 'pending') return () => handlers.cancel(request)
  if (request?.statusCode === 'approved') return handlers.release
  return handlers.request
}

/**
 * The tenant's request for its own SMS number: where it stands, and the actions open to it. A
 * Notify administrator assigns the number; until then SMS is sent from the shared Notify number.
 */
const SmsNumberRequestField: FC<SmsNumberRequestFieldProps> = ({ canEdit }) => {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const [request, setRequest] = useState<SmsNumberRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingRelease, setConfirmingRelease] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setRequest(await getMySmsNumberRequest())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load SMS number request')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTenant) load()
  }, [selectedTenant, load])

  async function act(action: () => Promise<SmsNumberRequest>, success: string) {
    setBusy(true)
    try {
      setRequest(await action())
      showSuccessToast(success)
      setConfirmingRelease(false)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const showActions = canEdit && !loading && !loadError

  return (
    <div className="settings__field" aria-busy={loading}>
      <span className="settings__label">SMS number</span>
      <div className="sms-number-request" role="status" aria-live="polite">
        {loading && <p className="sms-number-request__text">Loading…</p>}
        {!loading && loadError && <p className="sms-number-request__text">{loadError}</p>}
        {!loading && !loadError && !request && (
          <p className="sms-number-request__text">
            SMS is sent from the shared Notify number. Request a number of your own for this tenant.
          </p>
        )}
        {!loading && !loadError && request && (
          <>
            <SmsRequestStatusBadge status={request.statusCode} />
            <p className="sms-number-request__text">{describe(request)}</p>
          </>
        )}
      </div>
      {showActions && (
        <div className="sms-number-request__actions">
          <Button
            type="button"
            variant="secondary"
            size="small"
            isDisabled={busy}
            onPress={actionFor(request, {
              cancel: (pending) =>
                act(() => cancelMySmsNumberRequest(pending.id), 'SMS number request cancelled'),
              release: () => setConfirmingRelease(true),
              request: () => act(requestSmsNumber, 'SMS number requested'),
            })}
          >
            {actionLabel(request)}
          </Button>
        </div>
      )}
      {confirmingRelease && request && (
        <ConfirmDialog
          isOpen
          title={`Release ${request.phoneNumber ?? 'your number'}`}
          confirmLabel="Release number"
          danger
          isBusy={busy}
          onCancel={() => setConfirmingRelease(false)}
          onConfirm={() => act(() => releaseMySmsNumber(request.id), 'SMS number released')}
        >
          <p className="mb-0">
            SMS from this tenant will be sent from the shared Notify number. Getting a number back
            means requesting one again.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

export default SmsNumberRequestField
