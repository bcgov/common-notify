import { useState } from 'react'
import type { FC } from 'react'
import { TextArea } from '@bcgov/design-system-react-components'
import ConfirmDialog from '@/components/ConfirmDialog'
import { rejectSmsNumberRequest } from '@/api/smsNumbers.api'
import type { SmsNumberRequest } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const REASON_MAX_LENGTH = 500

interface RejectSmsNumberRequestDialogProps {
  request: SmsNumberRequest
  onClose: () => void
  onSaved: () => void
}

/** Rejects a request. The reason is required, and shown to the tenant in its SMS settings. */
const RejectSmsNumberRequestDialog: FC<RejectSmsNumberRequestDialogProps> = ({
  request,
  onClose,
  onSaved,
}) => {
  const [reason, setReason] = useState('')
  const [showError, setShowError] = useState(false)
  const [saving, setSaving] = useState(false)

  async function confirm() {
    if (!reason.trim()) {
      setShowError(true)
      return
    }
    setSaving(true)
    try {
      await rejectSmsNumberRequest(request.id, reason.trim())
      showSuccessToast(`${request.tenantName}'s request rejected`)
      onSaved()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to reject the request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog
      isOpen
      title={`Reject ${request.tenantName}'s request`}
      confirmLabel="Reject request"
      danger
      isBusy={saving}
      onCancel={onClose}
      onConfirm={confirm}
    >
      <TextArea
        label="Reason"
        description={`Shown to ${request.tenantName} in its SMS settings.`}
        value={reason}
        onChange={(value) => {
          setReason(value)
          if (value.trim()) setShowError(false)
        }}
        maxLength={REASON_MAX_LENGTH}
        isRequired
        isInvalid={showError}
        errorMessage="Enter a reason for rejecting the request."
        isDisabled={saving}
      />
    </ConfirmDialog>
  )
}

export default RejectSmsNumberRequestDialog
