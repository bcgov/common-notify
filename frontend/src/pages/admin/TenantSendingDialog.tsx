import { useState } from 'react'
import type { FC } from 'react'
import { TextArea } from '@bcgov/design-system-react-components'
import ConfirmDialog from '@/components/ConfirmDialog'
import { setTenantSending } from '@/api/apiKeyUsage.api'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const REASON_MAX_LENGTH = 500

type TenantSendingTarget = Pick<AdminTenantUsageRow, 'tenantId' | 'tenantName' | 'sendingEnabled'>

interface TenantSendingDialogProps {
  /** The tenant to switch; the dialog offers the opposite of its current state. */
  tenant: TenantSendingTarget
  onClose: () => void
  /** Called once the change is saved, so the caller can refetch. */
  onChanged: () => void
}

/**
 * Confirms enabling or disabling sending for a tenant. Disabling needs a reason: it is kept with
 * the change and returned in the error each rejected send gets. Render it keyed on the tenant so
 * the reason starts empty each time.
 */
const TenantSendingDialog: FC<TenantSendingDialogProps> = ({ tenant, onClose, onChanged }) => {
  const disabling = tenant.sendingEnabled
  const [reason, setReason] = useState('')
  const [showReasonError, setShowReasonError] = useState(false)
  const [saving, setSaving] = useState(false)

  async function confirm() {
    if (disabling && !reason.trim()) {
      setShowReasonError(true)
      return
    }
    setSaving(true)
    try {
      await setTenantSending(tenant.tenantId, !disabling, disabling ? reason.trim() : undefined)
      showSuccessToast(`Sending ${disabling ? 'disabled' : 'enabled'} for ${tenant.tenantName}`)
      onChanged()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to change tenant sending')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog
      isOpen
      title={`${disabling ? 'Disable' : 'Enable'} sending for ${tenant.tenantName}`}
      confirmLabel={disabling ? 'Disable sending' : 'Enable sending'}
      danger={disabling}
      isBusy={saving}
      onCancel={onClose}
      onConfirm={confirm}
    >
      {disabling ? (
        <div className="d-flex flex-column gap-3">
          <p className="mb-0">
            New sends from {tenant.tenantName}, through the API or the app, will be rejected.
            Scheduled sends are cancelled when they come due. Sends already queued still go out.
          </p>
          <TextArea
            label="Reason"
            description="Shown to admins, and in the error each rejected send returns."
            value={reason}
            onChange={(value) => {
              setReason(value)
              if (value.trim()) setShowReasonError(false)
            }}
            maxLength={REASON_MAX_LENGTH}
            isRequired
            isInvalid={showReasonError}
            errorMessage="Enter a reason for disabling sending."
            isDisabled={saving}
          />
        </div>
      ) : (
        <p className="mb-0">
          {tenant.tenantName} will be able to send again. Scheduled sends cancelled while it was
          disabled stay cancelled.
        </p>
      )}
    </ConfirmDialog>
  )
}

export default TenantSendingDialog
