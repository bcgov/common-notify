import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Select } from '@bcgov/design-system-react-components'
import EditModal from '@/components/EditModal'
import { approveTenantRequest } from '@/api/tenantRequests.api'
import { getSmsNumberCodes, getSmsNumbers } from '@/api/smsNumbers.api'
import type { SmsNumber, SmsNumberCodes } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { numberOptionLabel } from '@/pages/admin/sms-numbers/smsNumberLabels'
import type { ApproveDialogProps } from './approveDialogProps'

/** The picker's id for "the default number", which is not an inventory number. */
const DEFAULT_NUMBER = 'default-number'

/**
 * Approves a request for an SMS number by choosing the number to assign its tenant, replacing any
 * it has for that number's provider. Outside prod the default number is offered first, which
 * approves without assigning one.
 */
const ApproveSmsNumberRequestDialog: FC<ApproveDialogProps> = ({ request, onClose, onSaved }) => {
  const [numbers, setNumbers] = useState<SmsNumber[] | null>(null)
  const [codes, setCodes] = useState<SmsNumberCodes | null>(null)
  const [selected, setSelected] = useState<string | undefined>()
  const [showError, setShowError] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let current = true
    Promise.all([getSmsNumbers(), getSmsNumberCodes()])
      .then(([nextNumbers, nextCodes]) => {
        if (!current) return
        setNumbers(nextNumbers)
        setCodes(nextCodes)
      })
      .catch((error: unknown) => {
        if (current) {
          showErrorToast(error instanceof Error ? error.message : 'Failed to load SMS numbers')
        }
      })
    return () => {
      current = false
    }
  }, [])

  const defaultNumber = codes?.defaultNumberAssignable ? codes.defaultNumber : null
  const options = [
    ...(defaultNumber ? [{ id: DEFAULT_NUMBER, label: `Default number (${defaultNumber})` }] : []),
    ...(numbers ?? []).map((number) => ({
      id: number.id,
      label: numberOptionLabel(number, codes?.providers ?? []),
    })),
  ]
  const loading = numbers === null

  async function save() {
    if (!selected) {
      setShowError(true)
      return
    }
    setSaving(true)
    try {
      const approved = await approveTenantRequest(
        request.id,
        selected === DEFAULT_NUMBER ? { useDefaultNumber: true } : { smsNumberId: selected },
      )
      showSuccessToast(
        `Approved: ${approved.tenantName} now sends from ${approved.outcome ?? 'its number'}`,
      )
      onSaved()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to approve the request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EditModal
      isOpen
      title={`Approve ${request.tenantName}'s request`}
      saveLabel="Approve"
      isSaving={saving}
      onClose={onClose}
      onSave={save}
    >
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">
          {request.tenantName} will send from this number whenever SMS goes through its provider,
          replacing any number it has for that provider.
        </p>
        <Select
          label="Number"
          placeholder={loading ? 'Loading numbers...' : 'Select a number'}
          items={options}
          value={selected}
          onChange={(key) => {
            setSelected(key == null ? undefined : String(key))
            setShowError(false)
          }}
          isRequired
          validationBehavior="aria"
          isInvalid={showError}
          errorMessage="Select a number to assign."
          isDisabled={saving || options.length === 0}
        />
        {!loading && options.length === 0 && (
          <p className="mb-0 text-muted">Add a number on the SMS Numbers page first.</p>
        )}
      </div>
    </EditModal>
  )
}

export default ApproveSmsNumberRequestDialog
