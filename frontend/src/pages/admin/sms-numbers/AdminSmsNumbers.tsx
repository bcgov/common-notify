import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import TabBar from '@/components/TabBar'
import NoDataCard from '@/components/NoDataCard'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import RowActionsMenu from '@/components/RowActionsMenu'
import type { RowActionGroup } from '@/components/RowActionsMenu'
import { getSmsNumberCodes, getSmsNumbers } from '@/api/smsNumbers.api'
import type { SmsNumber, SmsNumberCodes } from '@/api/smsNumbers.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchNotifyTenantOptions } from '@/redux/thunks/adminTenants.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import SmsNumberDialogs from './SmsNumberDialogs'
import SmsNumberRequestsTable from './SmsNumberRequestsTable'
import SmsDefaultNumbersSummary from './SmsDefaultNumbersSummary'
import SmsDefaultTag from './SmsDefaultTag'
import type { SmsNumberAction, SmsNumberDialog } from './smsNumberDialog'
import { codeLabel } from './smsNumberLabels'
import '@/scss/components/admin-sms-numbers.scss'

type SmsNumbersTab = 'requests' | 'numbers'

const NUMBERS_PAGE_SIZES = [15, 30]

const TABS: { id: SmsNumbersTab; label: string }[] = [
  { id: 'requests', label: 'Requests' },
  { id: 'numbers', label: 'Numbers' },
]

/**
 * SMS numbers: tenants' requests for one, and the inventory of numbers with the tenants assigned
 * each. NOTIFY_ADMIN only, through routes/admin/route.tsx.
 */
const AdminSmsNumbers: FC = () => {
  const dispatch = useAppDispatch()
  const tenants = useAppSelector((state) => state.adminTenants.notifyOptions)
  const [numbers, setNumbers] = useState<SmsNumber[]>([])
  // Bumped after a save, so the requests table loads its current page again.
  const [requestsReloadKey, setRequestsReloadKey] = useState(0)
  const [numbersPage, setNumbersPage] = useState(1)
  const [numbersLimit, setNumbersLimit] = useState(NUMBERS_PAGE_SIZES[0])
  const [codes, setCodes] = useState<SmsNumberCodes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<SmsNumberDialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<SmsNumbersTab>('requests')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextNumbers, nextCodes] = await Promise.all([getSmsNumbers(), getSmsNumberCodes()])
      setNumbers(nextNumbers)
      setCodes(nextCodes)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load SMS numbers')
    } finally {
      setLoading(false)
    }
  }, [])

  /** After a save: the numbers and codes, and the requests table's current page. */
  const reload = useCallback(async () => {
    setRequestsReloadKey((key) => key + 1)
    await load()
  }, [load])

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
      await reload()
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

  const numberColumns: TableColumn<SmsNumber>[] = [
    {
      key: 'phoneNumber',
      label: 'Number',
      render: (_, number) => (
        <div className="admin-sms-numbers__stack">
          <span className="fw-semibold admin-sms-numbers__number">{number.phoneNumber}</span>
          {number.isDefault && <SmsDefaultTag />}
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
      label: 'Description',
      render: (_, number) => number.description ?? '',
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

  // The inventory is small and the dialogs need all of it, so it is paged here, not by the API.
  const numbersOnPage = numbers.slice((numbersPage - 1) * numbersLimit, numbersPage * numbersLimit)

  /** The Numbers tab: a card until there is a number, then the defaults and the table. */
  function renderNumbersTab() {
    if (!loading && !error && numbers.length === 0) {
      return (
        <NoDataCard
          title="No SMS numbers yet."
          message="Add the numbers Notify sends SMS from, then assign them to tenants or make one a provider's default."
          actionLabel="Add number"
          onAction={() => setDialog({ kind: 'add' })}
          isActionDisabled={!codes}
        />
      )
    }
    return (
      <>
        {codes && (
          <SmsDefaultNumbersSummary
            codes={codes}
            numbers={numbers}
            onChange={(providerCode) => setDialog({ kind: 'chooseDefault', providerCode })}
          />
        )}
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
          data={numbersOnPage}
          keyExtractor={(number) => number.id}
          multiline
          isLoading={loading}
          emptyMessage="No SMS numbers yet."
          currentPage={numbersPage}
          pageSize={numbersLimit}
          totalCount={numbers.length}
          onPageChange={setNumbersPage}
          onPageSizeChange={(size) => {
            setNumbersLimit(size)
            setNumbersPage(1)
          }}
          pageSizeOptions={NUMBERS_PAGE_SIZES}
          label="SMS numbers"
        />
      </>
    )
  }

  return (
    <div className="page">
      <PageHeading title="SMS Numbers" />
      {error && <div role="alert">{error}</div>}

      <TabBar label="SMS number views" items={TABS} selected={tab} onSelect={setTab} />

      {tab === 'requests' ? (
        <SmsNumberRequestsTable
          statuses={codes?.requestStatuses}
          reloadKey={requestsReloadKey}
          onAction={(kind, request) => setDialog({ kind, request })}
        />
      ) : (
        renderNumbersTab()
      )}

      {dialog && (
        <SmsNumberDialogs
          dialog={dialog}
          codes={codes}
          numbers={numbers}
          tenants={tenants}
          busy={busy}
          onClose={close}
          onSaved={reload}
          onConfirm={runConfirmed}
        />
      )}
    </div>
  )
}

export default AdminSmsNumbers
