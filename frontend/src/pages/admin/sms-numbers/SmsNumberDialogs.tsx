import type { FC } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  clearDefaultSmsNumber,
  deleteSmsNumber,
  setDefaultSmsNumber,
  unassignSmsNumber,
} from '@/api/smsNumbers.api'
import type { SmsNumber, SmsNumberCodes } from '@/api/smsNumbers.api'
import AssignSmsNumberDialog from './AssignSmsNumberDialog'
import ChooseDefaultNumberDialog from './ChooseDefaultNumberDialog'
import SmsNumberFormDialog from './SmsNumberFormDialog'
import type { SmsNumberDialog } from './smsNumberDialog'
import { codeLabel } from './smsNumberLabels'

interface SmsNumberDialogsProps {
  dialog: SmsNumberDialog
  codes: SmsNumberCodes | null
  numbers: readonly SmsNumber[]
  tenants: readonly { id: string; name: string }[]
  /** A confirmed action is running. */
  busy: boolean
  onClose: () => void
  /** Reload the page once a dialog has saved. */
  onSaved: () => void
  /** Run a confirmed action, toast its success, close and reload. */
  onConfirm: (action: () => Promise<void>, success: string) => void
}

/** Why a number cannot be removed yet, or what removing it does. */
function removeMessage(number: SmsNumber): string {
  if (number.isDefault) return 'This is the default number. Stop using it as the default first.'
  if (number.tenants.length > 0) {
    return 'Tenants are still assigned this number. Unassign it from each of them first.'
  }
  return 'The number is removed from Notify. It is not released at the provider.'
}

/** The open dialog of the SMS numbers page. Each is keyed on what it edits, so it starts fresh. */
const SmsNumberDialogs: FC<SmsNumberDialogsProps> = ({
  dialog,
  codes,
  numbers,
  tenants,
  busy,
  onClose,
  onSaved,
  onConfirm,
}) => {
  const providers = codes?.providers ?? []

  switch (dialog.kind) {
    case 'add':
    case 'edit':
      if (!codes) return null
      return (
        <SmsNumberFormDialog
          key={dialog.kind === 'edit' ? dialog.number.id : 'add'}
          codes={codes}
          number={dialog.kind === 'edit' ? dialog.number : undefined}
          onClose={onClose}
          onSaved={onSaved}
        />
      )
    case 'assign':
      return (
        <AssignSmsNumberDialog
          key={dialog.number.id}
          providers={providers}
          number={dialog.number}
          tenants={tenants}
          onClose={onClose}
          onSaved={onSaved}
        />
      )
    case 'unassign':
      return (
        <ConfirmDialog
          isOpen
          title={`Unassign ${dialog.number.phoneNumber}`}
          confirmLabel="Unassign"
          danger
          isBusy={busy}
          onCancel={onClose}
          onConfirm={() =>
            onConfirm(
              () => unassignSmsNumber(dialog.tenant.tenantId, dialog.number.id),
              `${dialog.number.phoneNumber} unassigned from ${dialog.tenant.tenantName}`,
            )
          }
        >
          <p className="mb-0">
            {dialog.tenant.tenantName} will send from the shared default number whenever SMS goes
            through {codeLabel(providers, dialog.number.providerCode)}.
          </p>
        </ConfirmDialog>
      )
    case 'chooseDefault':
      return (
        <ChooseDefaultNumberDialog
          key={dialog.providerCode}
          providerName={codeLabel(providers, dialog.providerCode)}
          numbers={numbers.filter((number) => number.providerCode === dialog.providerCode)}
          onClose={onClose}
          onSaved={onSaved}
        />
      )
    case 'makeDefault': {
      const current = numbers.find(
        (number) => number.isDefault && number.providerCode === dialog.number.providerCode,
      )
      return (
        <ConfirmDialog
          isOpen
          title={`Make ${dialog.number.phoneNumber} the default`}
          confirmLabel="Make the default"
          isBusy={busy}
          onCancel={onClose}
          onConfirm={() =>
            onConfirm(
              () => setDefaultSmsNumber(dialog.number.id).then(() => undefined),
              `${dialog.number.phoneNumber} is now the default`,
            )
          }
        >
          <p className="mb-0">
            Tenants without a number of their own will send from {dialog.number.phoneNumber}{' '}
            whenever SMS goes through {codeLabel(providers, dialog.number.providerCode)}
            {current ? `, instead of ${current.phoneNumber}` : ''}.
          </p>
        </ConfirmDialog>
      )
    }
    case 'clearDefault':
      return (
        <ConfirmDialog
          isOpen
          title={`Stop using ${dialog.number.phoneNumber} as the default`}
          confirmLabel="Stop using as the default"
          danger
          isBusy={busy}
          onCancel={onClose}
          onConfirm={() =>
            onConfirm(
              () => clearDefaultSmsNumber(dialog.number.id),
              `${dialog.number.phoneNumber} is no longer the default`,
            )
          }
        >
          <p className="mb-0">
            Until another number is made the default, tenants without a number of their own will
            send from the number in this environment&apos;s configuration whenever SMS goes through{' '}
            {codeLabel(providers, dialog.number.providerCode)}.
          </p>
        </ConfirmDialog>
      )
    case 'remove':
      return (
        <ConfirmDialog
          isOpen
          title={`Remove ${dialog.number.phoneNumber}`}
          confirmLabel="Remove"
          danger
          isBusy={busy}
          onCancel={onClose}
          onConfirm={() =>
            onConfirm(
              () => deleteSmsNumber(dialog.number.id),
              `${dialog.number.phoneNumber} removed`,
            )
          }
        >
          <p className="mb-0">{removeMessage(dialog.number)}</p>
        </ConfirmDialog>
      )
  }
}

export default SmsNumberDialogs
