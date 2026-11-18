import { useCallback, useEffect, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import ConfirmDialog from '@/components/ConfirmDialog'
import TenantRequestCard from '@/components/TenantRequestCard'
import {
  cancelMySmsNumberRequest,
  dismissMySmsNumberRequest,
  getMySmsNumberRequest,
  releaseMySmsNumber,
  requestSmsNumber,
} from '@/api/smsNumbers.api'
import type { SmsNumberRequest } from '@/api/smsNumbers.api'
import { useAppSelector } from '@/redux/hooks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import '@/scss/components/sms-number-request-field.scss'

interface SmsNumberRequestFieldProps {
  /** Whether the user may request or release a number (NOTIFY_OPERATIONS_ADMIN). */
  canEdit: boolean
  /** The tenant's saved SMS notifications setting: the test-environment note shows only when on. */
  smsEnabled: boolean
}

interface SenderLineProps {
  /** The number SMS goes out from now, if known. */
  number: string | null
  /** Whether it is the tenant's own number rather than the shared one. */
  ownNumber: boolean
  note: string | null
}

/** "Sending from +15551234567 (shared Notify number)": the one fact the tenant most needs. */
const SenderLine: FC<SenderLineProps> = ({ number, ownNumber, note }) => (
  <>
    <p className="sms-number-request__sender">
      <span className="sms-number-request__sender-label">Sending from</span>{' '}
      <strong>{number ?? 'the shared Notify number'}</strong>
      {number && (
        <span className="sms-number-request__sender-kind">
          {' '}
          ({ownNumber ? 'your number' : 'shared Notify number'})
        </span>
      )}
    </p>
    {note && <p className="sms-number-request__note">{note}</p>}
  </>
)

/** The muted line under the sender: why the tenant is on the shared number, where that needs it. */
function senderNote(
  request: SmsNumberRequest | null,
  testEnvironment: boolean,
  smsEnabled: boolean,
): string | null {
  if (request?.statusCode === 'approved' && request.usesDefaultNumber) {
    return 'Your request was approved on the shared number for this environment.'
  }
  return testEnvironment && smsEnabled ? 'Test environment: every tenant shares this number.' : null
}

/** What the request means for the tenant now, beyond what the card already says. */
function requestDetails(request: SmsNumberRequest): string | null {
  if (request.statusCode === 'pending') return 'A Notify administrator will review it.'
  if (request.statusCode === 'released' && request.phoneNumber) {
    return `${request.phoneNumber} is no longer assigned to this tenant.`
  }
  return null
}

/**
 * The tenant's SMS number: what it sends from now, and its request for a number of its own. A
 * Notify administrator assigns the number; until then SMS is sent from the shared Notify number.
 * Once approved, the request has done its job, so only the number and Release remain.
 */
const SmsNumberRequestField: FC<SmsNumberRequestFieldProps> = ({ canEdit, smsEnabled }) => {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const [request, setRequest] = useState<SmsNumberRequest | null>(null)
  const [senderNumber, setSenderNumber] = useState<string | null>(null)
  const [testEnvironment, setTestEnvironment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingRelease, setConfirmingRelease] = useState(false)

  /** Reads the request and the number in use; an action can change both. */
  const refresh = useCallback(async () => {
    const status = await getMySmsNumberRequest()
    setRequest(status.request)
    setSenderNumber(status.senderNumber)
    setTestEnvironment(status.testEnvironment)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      await refresh()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load SMS number request')
    } finally {
      setLoading(false)
    }
  }, [refresh])

  useEffect(() => {
    if (selectedTenant) load()
  }, [selectedTenant, load])

  /** Runs an action; one with no request to return (dismiss) leaves none on screen. */
  async function act(action: () => Promise<SmsNumberRequest | void>, success: string) {
    setBusy(true)
    try {
      setRequest((await action()) ?? null)
      showSuccessToast(success)
      setConfirmingRelease(false)
      // Releasing a number, say, changes what the tenant sends from.
      await refresh().catch(() => undefined)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const actionButton = (label: string, onPress: () => void) => (
    <Button type="button" variant="secondary" size="small" isDisabled={busy} onPress={onPress}>
      {label}
    </Button>
  )
  const askForNumber = (label: string) =>
    actionButton(label, () => act(requestSmsNumber, 'SMS number requested'))

  /** The card's main action: cancel while pending, else ask again. */
  function cardAction(current: SmsNumberRequest): ReactNode {
    if (!canEdit) return null
    if (current.statusCode !== 'pending') return askForNumber('Request another number')
    return actionButton('Cancel request', () =>
      act(() => cancelMySmsNumberRequest(current.id), 'SMS number request cancelled'),
    )
  }

  /** Below the sender line: the request card, or Release once approved, or a first request. */
  function renderRequest(): ReactNode {
    if (request?.statusCode === 'approved') {
      return canEdit ? (
        <div className="sms-number-request__actions">
          {actionButton('Release number', () => setConfirmingRelease(true))}
        </div>
      ) : null
    }
    if (request) {
      return (
        <TenantRequestCard
          request={request}
          typeLabel="Number request"
          details={requestDetails(request)}
          action={cardAction(request)}
          onDismiss={
            canEdit
              ? () =>
                  act(() => dismissMySmsNumberRequest(request.id), 'SMS number request dismissed')
              : undefined
          }
          isBusy={busy}
        />
      )
    }
    return canEdit ? (
      <div className="sms-number-request__actions">{askForNumber('Request an SMS number')}</div>
    ) : null
  }

  const loaded = !loading && !loadError
  const hasOwnNumber = request?.statusCode === 'approved' && !request.usesDefaultNumber

  return (
    <div className="settings__field" aria-busy={loading}>
      <span className="settings__label">SMS number</span>
      <div className="sms-number-request" role="status" aria-live="polite">
        {loading && <p className="sms-number-request__note">Loading…</p>}
        {!loading && loadError && <p className="sms-number-request__note">{loadError}</p>}
        {loaded && (
          <SenderLine
            number={senderNumber ?? (hasOwnNumber ? request.phoneNumber : null)}
            ownNumber={hasOwnNumber}
            note={hasOwnNumber ? null : senderNote(request, testEnvironment, smsEnabled)}
          />
        )}
      </div>
      {loaded && renderRequest()}
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
