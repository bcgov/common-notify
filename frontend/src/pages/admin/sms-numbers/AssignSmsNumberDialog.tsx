import { useState } from 'react'
import type { FC } from 'react'
import { Select } from '@bcgov/design-system-react-components'
import EditModal from '@/components/EditModal'
import { assignSmsNumber } from '@/api/smsNumbers.api'
import type { SmsCode, SmsNumber } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { codeLabel } from './smsNumberLabels'

interface AssignSmsNumberDialogProps {
  providers: readonly SmsCode[]
  /** The number to assign. */
  number: SmsNumber
  tenants: readonly { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}

/**
 * Assigns a number directly by choosing the tenant to give it, replacing the tenant's number for
 * that number's provider. Approving a tenant's request for a number does the same from the Tenant
 * Requests page.
 */
const AssignSmsNumberDialog: FC<AssignSmsNumberDialogProps> = ({
  providers,
  number,
  tenants,
  onClose,
  onSaved,
}) => {
  const [selected, setSelected] = useState<string | undefined>()
  const [showError, setShowError] = useState(false)
  const [saving, setSaving] = useState(false)

  const options = tenants
    .filter((tenant) => !number.tenants.some((t) => t.tenantId === tenant.id))
    .map((tenant) => ({ id: tenant.id, label: tenant.name }))

  async function save() {
    if (!selected) {
      setShowError(true)
      return
    }
    setSaving(true)
    try {
      await assignSmsNumber(selected, number.id)
      const tenant = options.find((option) => option.id === selected)?.label
      showSuccessToast(`${number.phoneNumber} assigned to ${tenant}`)
      onSaved()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to assign the number')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EditModal
      isOpen
      title={`Assign ${number.phoneNumber}`}
      saveLabel="Assign"
      isSaving={saving}
      onClose={onClose}
      onSave={save}
    >
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">
          The tenant will send from this number whenever SMS goes through{' '}
          {codeLabel(providers, number.providerCode)}, replacing any number it has for that
          provider.
        </p>
        <Select
          label="Tenant"
          placeholder="Select a tenant"
          items={options}
          value={selected}
          onChange={(key) => {
            setSelected(key == null ? undefined : String(key))
            setShowError(false)
          }}
          isRequired
          validationBehavior="aria"
          isInvalid={showError}
          errorMessage="Select a tenant."
          isDisabled={saving || options.length === 0}
        />
        {options.length === 0 && (
          <p className="mb-0 text-muted">Every tenant already has this number.</p>
        )}
      </div>
    </EditModal>
  )
}

export default AssignSmsNumberDialog
