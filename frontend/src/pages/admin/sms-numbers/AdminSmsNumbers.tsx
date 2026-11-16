import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import PageSubHeading from '@/components/PageSubHeading'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import RowActionsMenu from '@/components/RowActionsMenu'
import type { RowActionGroup } from '@/components/RowActionsMenu'
import SmsRequestStatusBadge from '@/components/SmsRequestStatusBadge'
import { getSmsNumberCodes, getSmsNumberRequests, getSmsNumbers } from '@/api/smsNumbers.api'
import type { SmsNumber, SmsNumberCodes, SmsNumberRequest } from '@/api/smsNumbers.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchNotifyTenantOptions } from '@/redux/thunks/adminTenants.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { formatDate } from '@/utils/dates'
import SmsNumberDialogs from './SmsNumberDialogs'
import type { SmsNumberAction, SmsNumberDialog } from './smsNumberDialog'
import { codeLabel } from './smsNumberLabels'
import '@/scss/components/admin-sms-numbers.scss'

/** What can be done with a request in each status. A decided or released one is a record only. */
const REQUEST_ACTIONS: Partial<Record<string, RowActionGroup['actions']>> = {
  pending: [
    { id: 'approve', label: 'Approve and assign a number' },
    { id: 'reject', label: 'Reject' },
  ],
  approved: [{ id: 'release', label: 'Release number' }],
}

/** Pending requests first, each group newest first. */
const byPendingThenNewest = (a: SmsNumberRequest, b: SmsNumberRequest) =>
  Number(b.statusCode === 'pending') - Number(a.statusCode === 'pending') ||
  b.requestedAt.localeCompare(a.requestedAt)

/** "By Pat Admin, Nov 17, 2026": who did something and when. */
const ByWhen: FC<{ verb: string; by: string | null; at: string }> = ({ verb, by, at }) => (
  <span className="admin-sms-numbers__detail">
    {verb}
    {by ? ` by ${by}` : ''} <time dateTime={at}>{formatDate(at)}</time>
  </span>
)

/**
 * Who decided a request and when, what came of it, and who released the number if anyone has. A
 * cancelled request was never decided, so shows who cancelled it.
 */
const RequestDecision: FC<{ request: SmsNumberRequest }> = ({ request }) => {
  if (request.cancelledAt) {
    return <ByWhen verb="Cancelled" by={request.cancelledBy} at={request.cancelledAt} />
  }
  if (!request.decidedAt) return <span className="admin-sms-numbers__detail">Not yet decided</span>
  const verb = request.statusCode === 'rejected' ? 'Rejected' : 'Approved'
  return (
    <div className="admin-sms-numbers__stack">
      {request.phoneNumber && <span>{request.phoneNumber}</span>}
      {request.usesDefaultNumber && <span>Default number</span>}
      {request.decisionReason && <span>{request.decisionReason}</span>}
      <ByWhen verb={verb} by={request.decidedBy} at={request.decidedAt} />
      {request.releasedAt && (
        <ByWhen verb="Released" by={request.releasedBy} at={request.releasedAt} />
      )}
    </div>
  )
}

/**
 * SMS numbers: tenants' requests for one, and the inventory of numbers with the tenants assigned
 * each. NOTIFY_ADMIN only, through routes/admin/route.tsx.
 */
const AdminSmsNumbers: FC = () => {
  const dispatch = useAppDispatch()
  const tenants = useAppSelector((state) => state.adminTenants.notifyOptions)
  const [numbers, setNumbers] = useState<SmsNumber[]>([])
  const [requests, setRequests] = useState<SmsNumberRequest[]>([])
  const [codes, setCodes] = useState<SmsNumberCodes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<SmsNumberDialog | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextNumbers, nextRequests, nextCodes] = await Promise.all([
        getSmsNumbers(),
        getSmsNumberRequests(),
        getSmsNumberCodes(),
      ])
      setNumbers(nextNumbers)
      setRequests([...nextRequests].sort(byPendingThenNewest))
      setCodes(nextCodes)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load SMS numbers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    dispatch(fetchNotifyTenantOptions())
  }, [load, dispatch])

  const close = () => setDialog(null)
  const providers = codes?.providers ?? []

  async function runConfirmed(action: () => Promise<void>, success: string) {
    setBusy(true)
    try {
      await action()
      showSuccessToast(success)
      close()
      await load()
    } catch (actionError) {
      showErrorToast(actionError instanceof Error ? actionError.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function numberActionGroups(number: SmsNumber): RowActionGroup[] {
    const groups: RowActionGroup[] = [
      {
        id: 'manage',
        actions: [
          { id: 'edit', label: 'Edit' },
          { id: 'assign', label: 'Assign to a tenant' },
          number.isDefault
            ? { id: 'clearDefault', label: 'Stop using as the default' }
            : { id: 'makeDefault', label: 'Make the default' },
        ],
      },
    ]
    if (number.tenants.length > 0) {
      groups.push({
        id: 'unassign',
        actions: number.tenants.map((tenant) => ({
          id: `unassign:${tenant.tenantId}`,
          label: `Unassign from ${tenant.tenantName}`,
        })),
      })
    }
    groups.push({ id: 'remove', actions: [{ id: 'remove', label: 'Remove' }] })
    return groups
  }

  function handleNumberAction(number: SmsNumber, actionId: string) {
    if (actionId.startsWith('unassign:')) {
      const tenant = number.tenants.find((t) => `unassign:${t.tenantId}` === actionId)
      if (tenant) setDialog({ kind: 'unassign', number, tenant })
      return
    }
    setDialog({ kind: actionId as SmsNumberAction, number })
  }

  const requestColumns: TableColumn<SmsNumberRequest>[] = [
    {
      key: 'tenantName',
      label: 'Tenant',
      render: (_, request) => <span className="fw-semibold">{request.tenantName}</span>,
    },
    {
      key: 'statusCode',
      label: 'Status',
      render: (_, request) => <SmsRequestStatusBadge status={request.statusCode} />,
    },
    {
      key: 'requestedAt',
      label: 'Requested',
      render: (_, request) => (
        <div className="admin-sms-numbers__stack">
          <time dateTime={request.requestedAt}>{formatDate(request.requestedAt)}</time>
          {request.requestedBy && (
            <span className="admin-sms-numbers__detail">By {request.requestedBy}</span>
          )}
        </div>
      ),
    },
    {
      key: 'decidedAt',
      label: 'Decision',
      render: (_, request) => <RequestDecision request={request} />,
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_, request) => {
        const actions = REQUEST_ACTIONS[request.statusCode]
        return actions ? (
          <RowActionsMenu
            label={`Actions for ${request.tenantName}'s request`}
            groups={[{ id: 'request', actions }]}
            onAction={(actionId) =>
              setDialog({ kind: actionId as 'approve' | 'reject' | 'release', request })
            }
          />
        ) : null
      },
    },
  ]

  const numberColumns: TableColumn<SmsNumber>[] = [
    {
      key: 'phoneNumber',
      label: 'Number',
      render: (_, number) => (
        <div className="admin-sms-numbers__stack">
          <span className="fw-semibold admin-sms-numbers__number">{number.phoneNumber}</span>
          {number.isDefault && <span className="admin-sms-numbers__default">Default</span>}
          <span className="admin-sms-numbers__detail">
            {codeLabel(codes?.numberTypes ?? [], number.numberTypeCode)}
          </span>
        </div>
      ),
    },
    {
      key: 'providerCode',
      label: 'Provider',
      render: (_, number) => (
        <div className="admin-sms-numbers__stack">
          <span>{codeLabel(providers, number.providerCode)}</span>
          {number.providerCode === codes?.activeProvider && (
            <span className="admin-sms-numbers__detail">Sending now</span>
          )}
        </div>
      ),
    },
    {
      key: 'tenants',
      label: 'Tenants',
      render: (_, number) =>
        number.tenants.length === 0 ? (
          <span className="admin-sms-numbers__detail">Not assigned</span>
        ) : (
          <ul className="admin-sms-numbers__tenants">
            {number.tenants.map((tenant) => (
              <li key={tenant.tenantId}>{tenant.tenantName}</li>
            ))}
          </ul>
        ),
    },
    {
      key: 'description',
      label: 'Details',
      render: (_, number) => (
        <div className="admin-sms-numbers__stack">
          {number.description && <span>{number.description}</span>}
          {number.providerReference && (
            <span className="admin-sms-numbers__detail">{number.providerReference}</span>
          )}
        </div>
      ),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_, number) => (
        <RowActionsMenu
          label={`Actions for ${number.phoneNumber}`}
          groups={numberActionGroups(number)}
          onAction={(actionId) => handleNumberAction(number, actionId)}
        />
      ),
    },
  ]

  const pendingCount = requests.filter((request) => request.statusCode === 'pending').length

  return (
    <div className="page">
      <PageHeading
        title="SMS Numbers"
        meta={
          loading ? undefined : `${pendingCount} pending request(s), ${numbers.length} number(s)`
        }
      />
      {error && <div role="alert">{error}</div>}

      <section className="page__section" aria-labelledby="sms-requests-heading">
        <PageSubHeading title="Requests" id="sms-requests-heading" />
        <DataTable
          columns={requestColumns}
          data={requests}
          keyExtractor={(request) => request.id}
          multiline
          isLoading={loading}
          emptyMessage="No tenant has requested an SMS number."
          label="SMS number requests"
        />
      </section>

      <section className="page__section" aria-labelledby="sms-numbers-heading">
        <PageSubHeading title="Numbers" id="sms-numbers-heading" />
        <div className="page__toolbar">
          <Button
            variant="primary"
            size="small"
            isDisabled={!codes}
            onPress={() => setDialog({ kind: 'add' })}
          >
            Add number
          </Button>
        </div>
        <DataTable
          columns={numberColumns}
          data={numbers}
          keyExtractor={(number) => number.id}
          multiline
          isLoading={loading}
          emptyMessage="No SMS numbers yet."
          label="SMS numbers"
        />
      </section>

      {dialog && (
        <SmsNumberDialogs
          dialog={dialog}
          codes={codes}
          numbers={numbers}
          tenants={tenants}
          busy={busy}
          onClose={close}
          onSaved={load}
          onConfirm={runConfirmed}
        />
      )}
    </div>
  )
}

export default AdminSmsNumbers
