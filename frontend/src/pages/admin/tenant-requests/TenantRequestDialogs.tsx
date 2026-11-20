import type { FC } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { approveTenantRequest, releaseTenantRequest } from '@/api/tenantRequests.api'
import type { TenantRequest } from '@/api/tenantRequests.api'
import RejectTenantRequestDialog from './RejectTenantRequestDialog'
import type { TenantRequestAction } from './TenantRequestsTable'
import { REQUEST_TYPES, genericReleaseMessage } from './types/requestTypes'

export interface TenantRequestDialog {
  kind: TenantRequestAction
  request: TenantRequest
}

interface TenantRequestDialogsProps {
  dialog: TenantRequestDialog
  /** What the request is for, as the Type column reads, e.g. "SMS number". */
  typeLabel: string
  /** A confirmed action is running. */
  busy: boolean
  onClose: () => void
  /** Reload the table once a dialog has saved. */
  onSaved: () => void
  /** Run a confirmed action, toast its success, close and reload. */
  onConfirm: (action: () => Promise<void>, success: string) => void
}

/**
 * The open dialog of the tenant requests page. Approving uses the request type's own dialog when it
 * needs a choice; rejecting and releasing work the same for every type.
 */
const TenantRequestDialogs: FC<TenantRequestDialogsProps> = ({
  dialog,
  typeLabel,
  busy,
  onClose,
  onSaved,
  onConfirm,
}) => {
  const { request } = dialog
  const ui = REQUEST_TYPES[request.requestTypeCode]

  switch (dialog.kind) {
    case 'approve': {
      if (ui?.ApproveDialog) {
        return (
          <ui.ApproveDialog
            key={request.id}
            request={request}
            onClose={onClose}
            onSaved={onSaved}
          />
        )
      }
      return (
        <ConfirmDialog
          isOpen
          title={`Approve ${request.tenantName}'s request`}
          confirmLabel="Approve"
          isBusy={busy}
          onCancel={onClose}
          onConfirm={() =>
            onConfirm(
              () => approveTenantRequest(request.id).then(() => undefined),
              `${request.tenantName}'s request approved`,
            )
          }
        >
          <p className="mb-0">
            {request.tenantName} asked for {typeLabel}. Approving grants it.
          </p>
        </ConfirmDialog>
      )
    }
    case 'reject':
      return (
        <RejectTenantRequestDialog
          key={request.id}
          request={request}
          onClose={onClose}
          onSaved={onSaved}
        />
      )
    case 'release':
      return (
        <ConfirmDialog
          isOpen
          title={`Release ${request.tenantName}'s ${typeLabel}`}
          confirmLabel="Release"
          danger
          isBusy={busy}
          onCancel={onClose}
          onConfirm={() =>
            onConfirm(
              () => releaseTenantRequest(request.id).then(() => undefined),
              `${request.tenantName}'s ${typeLabel} released`,
            )
          }
        >
          <p className="mb-0">{(ui?.releaseMessage ?? genericReleaseMessage)(request)}</p>
        </ConfirmDialog>
      )
  }
}

export default TenantRequestDialogs
