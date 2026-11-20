import { useState } from 'react'
import type { FC } from 'react'
import { Select, TextArea, TextField } from '@bcgov/design-system-react-components'
import EditModal from '@/components/EditModal'
import { createSmsNumber, updateSmsNumber } from '@/api/smsNumbers.api'
import type { SmsNumber, SmsNumberCodes } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { numberTypeRule } from './numberTypeRules'

interface SmsNumberFormDialogProps {
  codes: SmsNumberCodes
  /** The number to edit; omit to add one. */
  number?: SmsNumber
  onClose: () => void
  onSaved: () => void
}

/**
 * Adds a number to the inventory, or edits one. The type comes first, since it decides what the
 * number must look like. A number's digits and provider are fixed once added: changing them would
 * move every tenant assigned it, so a new number is added instead. Its type can still change, as
 * long as the number fits the new one.
 * Render it keyed on the number so the fields start from it each time.
 */
const SmsNumberFormDialog: FC<SmsNumberFormDialogProps> = ({ codes, number, onClose, onSaved }) => {
  const editing = Boolean(number)
  const [phoneNumber, setPhoneNumber] = useState(number?.phoneNumber ?? '')
  const [providerCode, setProviderCode] = useState(number?.providerCode ?? codes.activeProvider)
  const [numberTypeCode, setNumberTypeCode] = useState(number?.numberTypeCode ?? 'long_code')
  const [description, setDescription] = useState(number?.description ?? '')
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  const rule = numberTypeRule(numberTypeCode)
  const numberInvalid = !rule.pattern.test(phoneNumber.trim())

  async function save() {
    if (numberInvalid) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    try {
      const details = {
        numberTypeCode,
        description: description.trim() || null,
      }
      if (number) {
        await updateSmsNumber(number.id, details)
        showSuccessToast(`${number.phoneNumber} updated`)
      } else {
        await createSmsNumber({ ...details, phoneNumber: phoneNumber.trim(), providerCode })
        showSuccessToast(`${phoneNumber.trim()} added`)
      }
      onSaved()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to save the number')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EditModal
      isOpen
      title={number ? `Edit ${number.phoneNumber}` : 'Add an SMS number'}
      saveLabel={editing ? 'Save' : 'Add number'}
      isSaving={saving}
      onClose={onClose}
      onSave={save}
    >
      <div className="d-flex flex-column gap-3">
        <Select
          label="Type"
          items={codes.numberTypes.map((code) => ({ id: code.code, label: code.description }))}
          value={numberTypeCode}
          onChange={(key) => key != null && setNumberTypeCode(String(key))}
          // Editing, the number is fixed, so a type it does not fit is the error.
          isInvalid={editing && numberInvalid}
          errorMessage={`${phoneNumber} is not a valid number of this type.`}
          isDisabled={saving}
          isRequired
        />
        <TextField
          label="Number"
          description={editing ? 'Fixed once added' : rule.hint}
          value={phoneNumber}
          onChange={(value) => setPhoneNumber(value)}
          isReadOnly={editing}
          isRequired
          isInvalid={!editing && showErrors && numberInvalid}
          errorMessage={rule.error}
          isDisabled={saving}
        />
        <Select
          label="Provider"
          description={editing ? 'Fixed once added' : 'The provider hosting this number'}
          items={codes.providers.map((code) => ({ id: code.code, label: code.description }))}
          value={providerCode}
          onChange={(key) => key != null && setProviderCode(String(key))}
          isDisabled={editing || saving}
          isRequired
        />
        <TextArea
          label="Description"
          value={description}
          onChange={(value) => setDescription(value)}
          maxLength={500}
          isDisabled={saving}
        />
      </div>
    </EditModal>
  )
}

export default SmsNumberFormDialog
