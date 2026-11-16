import { useState } from 'react'
import type { FC } from 'react'
import { Select } from '@bcgov/design-system-react-components'
import EditModal from '@/components/EditModal'
import { approveSmsNumberRequest, assignSmsNumber } from '@/api/smsNumbers.api'
import type { SmsCode, SmsNumber, SmsNumberRequest } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { codeLabel, numberOptionLabel } from './smsNumberLabels'

interface Option {
  id: string
  label: string
}

/** The picker's id for "the default number", which is not an inventory number. */
const DEFAULT_NUMBER = 'default-number'

type AssignSmsNumberDialogProps = {
  providers: readonly SmsCode[]
  onClose: () => void
  onSaved: () => void
} & (
  | {
      /** Approve this request by choosing the number to assign its tenant. */
      request: SmsNumberRequest
      numbers: readonly SmsNumber[]
      /** Offered first when set: approve on the default number. Only outside prod. */
      defaultNumber?: string
    }
  | {
      /** Assign this number by choosing the tenant to give it. */
      number: SmsNumber
      tenants: readonly { id: string; name: string }[]
    }
)

/**
 * Gives a tenant a number: approving its request (pick a number), or assigning a number directly
 * (pick a tenant). Either way it replaces the tenant's number for that number's provider.
 */
const AssignSmsNumberDialog: FC<AssignSmsNumberDialogProps> = (props) => {
  const { providers, onClose, onSaved } = props
  const approving = 'request' in props
  const [selected, setSelected] = useState<string | undefined>()
  const [showError, setShowError] = useState(false)
  const [saving, setSaving] = useState(false)

  const options: Option[] = approving
    ? [
        ...(props.defaultNumber
          ? [{ id: DEFAULT_NUMBER, label: `Default number (${props.defaultNumber})` }]
          : []),
        ...props.numbers.map((number) => ({
          id: number.id,
          label: numberOptionLabel(number, providers),
        })),
      ]
    : props.tenants
        .filter((tenant) => !props.number.tenants.some((t) => t.tenantId === tenant.id))
        .map((tenant) => ({ id: tenant.id, label: tenant.name }))

  async function save() {
    if (!selected) {
      setShowError(true)
      return
    }
    setSaving(true)
    try {
      if (approving) {
        const approved = await approveSmsNumberRequest(
          props.request.id,
          selected === DEFAULT_NUMBER ? null : selected,
        )
        showSuccessToast(
          `Approved: ${approved.tenantName} now sends from ${approved.phoneNumber ?? 'the default number'}`,
        )
      } else {
        await assignSmsNumber(selected, props.number.id)
        const tenant = options.find((option) => option.id === selected)?.label
        showSuccessToast(`${props.number.phoneNumber} assigned to ${tenant}`)
      }
      onSaved()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to assign the number')
    } finally {
      setSaving(false)
    }
  }

  const providerName = approving ? '' : codeLabel(providers, props.number.providerCode)

  return (
    <EditModal
      isOpen
      title={
        approving
          ? `Approve ${props.request.tenantName}'s request`
          : `Assign ${props.number.phoneNumber}`
      }
      saveLabel={approving ? 'Approve' : 'Assign'}
      isSaving={saving}
      onClose={onClose}
      onSave={save}
    >
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">
          {approving
            ? `${props.request.tenantName} will send from this number whenever SMS goes through its provider, replacing any number it has for that provider.`
            : `The tenant will send from this number whenever SMS goes through ${providerName}, replacing any number it has for that provider.`}
        </p>
        <Select
          label={approving ? 'Number' : 'Tenant'}
          placeholder={approving ? 'Select a number' : 'Select a tenant'}
          items={options}
          value={selected}
          onChange={(key) => {
            setSelected(key == null ? undefined : String(key))
            setShowError(false)
          }}
          isRequired
          validationBehavior="aria"
          isInvalid={showError}
          errorMessage={approving ? 'Select a number to assign.' : 'Select a tenant.'}
          isDisabled={saving || options.length === 0}
        />
        {options.length === 0 && (
          <p className="mb-0 text-muted">
            {approving ? 'Add a number first.' : 'Every tenant already has this number.'}
          </p>
        )}
      </div>
    </EditModal>
  )
}

export default AssignSmsNumberDialog
