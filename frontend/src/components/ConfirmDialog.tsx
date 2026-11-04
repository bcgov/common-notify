import type { FC, ReactNode } from 'react'
import { AlertDialog, Button, Modal } from '@bcgov/design-system-react-components'

type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  /** Styles the confirm button as destructive, for actions that switch something off. */
  danger?: boolean
  /** True while the confirmed action is being persisted; both buttons wait for it. */
  isBusy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Asks the user to confirm an action that takes effect immediately. Cancel and the confirm
 * button sit in the footer; dismissal is blocked while the action is in flight.
 */
const ConfirmDialog: FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  children,
  confirmLabel,
  danger = false,
  isBusy = false,
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
      title={title}
      // AlertDialog renders `title` as a plain div rather than a <Heading slot="title">, so
      // the underlying Dialog needs an explicit label.
      aria-label={title}
      buttons={
        <>
          <Button variant="tertiary" onPress={onCancel} isDisabled={isBusy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'secondary' : 'primary'}
            danger={danger}
            onPress={onConfirm}
            isDisabled={isBusy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </AlertDialog>
  </Modal>
)

export default ConfirmDialog
