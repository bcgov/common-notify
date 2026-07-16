import type { FC, ReactNode } from 'react'
import { Modal, AlertDialog, Button } from '@bcgov/design-system-react-components'

interface EditModalProps {
  isOpen: boolean
  title: string
  /** Disables inputs/buttons and blocks dismissal while a save is in flight. */
  isSaving?: boolean
  saveLabel?: string
  onClose: () => void
  onSave: () => void
  children: ReactNode
}

/**
 * Shared edit-dialog chrome (BC Modal + AlertDialog with Cancel/Save footer). The caller
 * supplies the title and the form body (children) and wires onSave/onClose. While isSaving
 * is true the Save button shows "Saving…", buttons disable, and the modal cannot be dismissed.
 */
const EditModal: FC<EditModalProps> = ({
  isOpen,
  title,
  isSaving = false,
  saveLabel = 'Save',
  onClose,
  onSave,
  children,
}) => (
  <Modal
    isOpen={isOpen}
    isDismissable={!isSaving}
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
  >
    <AlertDialog
      isIconHidden
      isCloseable
      title={title}
      buttons={
        <>
          <Button variant="tertiary" onPress={onClose} isDisabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onPress={onSave} isDisabled={isSaving}>
            {isSaving ? 'Saving…' : saveLabel}
          </Button>
        </>
      }
    >
      {children}
    </AlertDialog>
  </Modal>
)

export default EditModal
