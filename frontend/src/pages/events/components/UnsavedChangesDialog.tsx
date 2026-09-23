import type { FC } from 'react'
import GenericModal from '@/components/GenericModal'

type UnsavedChangesDialogProps = {
  /** Abandons the edits and lets the blocked navigation through. */
  onLeave: () => void
  /** Cancels the navigation and leaves the form as it was. */
  onStay: () => void
}

/**
 * Warns before a navigation that would drop unsaved email settings. Only "Leave without saving"
 * discards them - the close button, like "Stay on page", keeps the user where they are.
 *
 * Mounted only while a navigation is actually blocked, since it works off the router blocker's
 * resolver, which only exists then.
 */
const UnsavedChangesDialog: FC<UnsavedChangesDialogProps> = ({ onLeave, onStay }) => (
  <GenericModal
    isOpen
    onClose={onStay}
    title="Unsaved changes"
    cancelText="Leave without saving"
    onCancel={onLeave}
    cancelVariant="tertiary"
    cancelDanger
    onSubmit={onStay}
    submitText="Stay on page"
  >
    You have unsaved changes to your email notification settings. If you leave this page, your
    changes will be lost.
  </GenericModal>
)

export default UnsavedChangesDialog
