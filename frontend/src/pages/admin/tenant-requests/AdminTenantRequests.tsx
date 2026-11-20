import { useEffect, useState } from 'react'
import type { FC } from 'react'
import PageHeading from '@/components/PageHeading'
import { getTenantRequestCodes } from '@/api/tenantRequests.api'
import type { TenantRequestCodes } from '@/api/tenantRequests.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import TenantRequestsTable from './TenantRequestsTable'
import TenantRequestDialogs from './TenantRequestDialogs'
import type { TenantRequestDialog } from './TenantRequestDialogs'
import '@/scss/components/admin-tenant-requests.scss'

/**
 * Every tenant's requests for things a Notify admin must approve, such as an SMS number, and the
 * decisions on them. NOTIFY_ADMIN only, through routes/admin/route.tsx.
 */
const AdminTenantRequests: FC = () => {
  const [codes, setCodes] = useState<TenantRequestCodes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<TenantRequestDialog | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped after a save, so the table loads its current page again.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    getTenantRequestCodes()
      .then(setCodes)
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Failed to load request types'),
      )
  }, [])

  const close = () => setDialog(null)
  const reload = () => setReloadKey((key) => key + 1)
  const typeLabel = (code: string) =>
    codes?.types.find((type) => type.code === code)?.description ?? code

  async function runConfirmed(action: () => Promise<void>, success: string) {
    setBusy(true)
    try {
      await action()
      showSuccessToast(success)
      close()
      reload()
    } catch (actionError) {
      showErrorToast(actionError instanceof Error ? actionError.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHeading title="Tenant Requests" />
      {error && <div role="alert">{error}</div>}

      <TenantRequestsTable
        types={codes?.types ?? []}
        statuses={codes?.statuses}
        reloadKey={reloadKey}
        onAction={(kind, request) => setDialog({ kind, request })}
      />

      {dialog && (
        <TenantRequestDialogs
          dialog={dialog}
          typeLabel={typeLabel(dialog.request.requestTypeCode)}
          busy={busy}
          onClose={close}
          onSaved={reload}
          onConfirm={runConfirmed}
        />
      )}
    </div>
  )
}

export default AdminTenantRequests
