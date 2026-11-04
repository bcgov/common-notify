import type { FC } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

type ConfirmDeactivateDialogProps = {
  isOpen: boolean
  /** True while the deactivation is being persisted; both buttons wait for it. */
  isBusy: boolean
  onCancel: () => void
  onConfirm: () => void
  description?: string
}

/**
 * Asks before switching a channel off. Turning a channel off takes effect immediately, unlike
 * every other setting on the tabs, which is why it asks at all.
 */
const ConfirmDeactivateDialog: FC<ConfirmDeactivateDialogProps> = ({
  isOpen,
  isBusy,
  onCancel,
  onConfirm,
  description = 'This will stop notifications from being sent through this channel. Your settings will be saved and can be reactivated at any time.',
}) => (
  <ConfirmDialog
    isOpen={isOpen}
    isBusy={isBusy}
    title="Deactivate this channel?"
    confirmLabel="Deactivate"
    danger
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    {description}
  </ConfirmDialog>
)

export default ConfirmDeactivateDialog
