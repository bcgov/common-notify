import type { FC } from 'react'
import { AlertDialog, Button, Modal } from '@bcgov/design-system-react-components'

type ConfirmDeactivateDialogProps = {
  isOpen: boolean
  /** True while the deactivation is being persisted; both buttons wait for it. */
  isBusy: boolean
  onCancel: () => void
  onConfirm: () => void
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
}) => (
  <Modal
    isOpen={isOpen}
    isDismissable={!isBusy}
    onOpenChange={(open) => {
      if (!open) onCancel()
    }}
  >
    <AlertDialog
      variant="confirmation"
      isIconHidden
      title="Deactivate this channel?"
      // AlertDialog renders `title` as a plain div rather than a <Heading slot="title">, so
      // the underlying Dialog needs an explicit label.
      aria-label="Deactivate this channel?"
      buttons={
        <>
          <Button variant="tertiary" onPress={onCancel} isDisabled={isBusy}>
            Cancel
          </Button>
          <Button variant="secondary" danger onPress={onConfirm} isDisabled={isBusy}>
            Deactivate
          </Button>
        </>
      }
    >
      This will stop notifications from being sent through this channel. Your settings will be saved
      and can be reactivated at any time.
    </AlertDialog>
  </Modal>
)

export default ConfirmDeactivateDialog
