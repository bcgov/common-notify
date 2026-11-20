import { useState } from 'react'
import type { FC } from 'react'
import { Select } from '@bcgov/design-system-react-components'
import EditModal from '@/components/EditModal'
import { clearDefaultSmsNumber, setDefaultSmsNumber } from '@/api/smsNumbers.api'
import type { SmsNumber } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

/** The picker's id for "no default", which is not a number. */
const NO_DEFAULT = 'no-default'

interface ChooseDefaultNumberDialogProps {
  providerName: string
  /** This provider's numbers. */
  numbers: readonly SmsNumber[]
  onClose: () => void
  onSaved: () => void
}

/** Picks a provider's default number, or none, replacing the current one. */
const ChooseDefaultNumberDialog: FC<ChooseDefaultNumberDialogProps> = ({
  providerName,
  numbers,
  onClose,
  onSaved,
}) => {
  const current = numbers.find((number) => number.isDefault)
  const [selected, setSelected] = useState(current?.id ?? NO_DEFAULT)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (selected === (current?.id ?? NO_DEFAULT)) {
      onClose()
      return
    }
    setSaving(true)
    try {
      if (selected === NO_DEFAULT && current) {
        await clearDefaultSmsNumber(current.id)
        showSuccessToast(`${providerName} no longer has a default number`)
      } else {
        const chosen = await setDefaultSmsNumber(selected)
        showSuccessToast(`${chosen.phoneNumber} is now the ${providerName} default`)
      }
      onSaved()
      onClose()
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to change the default')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EditModal
      isOpen
      title={`${providerName} default number`}
      isSaving={saving}
      onClose={onClose}
      onSave={save}
    >
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">
          Tenants without a number of their own send from this whenever SMS goes through{' '}
          {providerName}.
        </p>
        <Select
          label="Default number"
          items={[
            { id: NO_DEFAULT, label: 'No default' },
            ...numbers.map((number) => ({ id: number.id, label: number.phoneNumber })),
          ]}
          value={selected}
          onChange={(key) => key != null && setSelected(String(key))}
          isDisabled={saving}
        />
      </div>
    </EditModal>
  )
}

export default ChooseDefaultNumberDialog
