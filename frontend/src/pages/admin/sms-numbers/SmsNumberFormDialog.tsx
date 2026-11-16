import { useState } from 'react'
import type { FC } from 'react'
import { Select, TextArea, TextField } from '@bcgov/design-system-react-components'
import EditModal from '@/components/EditModal'
import { createSmsNumber, updateSmsNumber } from '@/api/smsNumbers.api'
import type { SmsNumber, SmsNumberCodes } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

/** E.164, or a 5-6 digit short code: the backend's and the database's rule. */
const NUMBER_PATTERN = /^(\+[1-9]\d{6,14}|\d{5,6})$/

interface SmsNumberFormDialogProps {
  codes: SmsNumberCodes
  /** The number to edit; omit to add one. */
  number?: SmsNumber
  onClose: () => void
  onSaved: () => void
}

/**
 * Adds a number to the inventory, or edits one. A number's digits and provider are fixed once
 * added: changing them would move every tenant assigned it, so a new number is added instead.
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

  const numberInvalid = !editing && !NUMBER_PATTERN.test(phoneNumber.trim())

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
        <TextField
          label="Number"
          description="E.164, such as +15551234567, or a 5-6 digit short code"
          value={phoneNumber}
          onChange={(value) => setPhoneNumber(value)}
          isReadOnly={editing}
          isRequired
          isInvalid={showErrors && numberInvalid}
          errorMessage="Enter an E.164 number or a 5-6 digit short code."
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
        <Select
          label="Type"
          items={codes.numberTypes.map((code) => ({ id: code.code, label: code.description }))}
          value={numberTypeCode}
          onChange={(key) => key != null && setNumberTypeCode(String(key))}
          isDisabled={saving}
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
