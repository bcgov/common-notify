import type { FC, ReactNode } from 'react'
import { useBlocker } from '@tanstack/react-router'
import GenericModal from '@/components/GenericModal'

type UnsavedChangesProps = {
  modalTitle?: string
  modalMessage?: ReactNode
  /** Browser level: true while there are edits a save has not persisted yet. */
  hasUnsavedChanges?: boolean
  /** A save is in flight, so the navigation it makes of its own is let through. */
  isSaving?: boolean
  /** App level: the caller has intercepted its own action and is waiting on an answer. */
  isBlocked?: boolean
  /** Abandons the edits and carries out the action the caller is holding. Pass with `isBlocked`. */
  onLeave?: () => void
  /** Drops that action and leaves the form as it was. Pass with `isBlocked`. */
  onStay?: () => void
}

/**
 * Warns before something that would drop unsaved edits. It guards navigation at two levels:
 * browser level, where `hasUnsavedChanges` blocks route changes and refreshes, and app level,
 * where the caller intercepts its own action (navigating to different page, tab switch, etc)
 * and drives the dialog with `isBlocked`.
 */
const UnsavedChanges: FC<UnsavedChangesProps> = ({
  modalTitle = 'Unsaved changes',
  modalMessage = 'You have unsaved changes. If you leave this page, your changes will be lost.',
  hasUnsavedChanges,
  isSaving,
  isBlocked,
  onLeave = () => {},
  onStay = () => {},
}) => {
  // Always registered, since hooks cannot be called conditionally; inert without hasUnsavedChanges.
  const blocker = useBlocker({
    // Blocks route changes, except the one a save makes on its own way out.
    shouldBlockFn: () => Boolean(hasUnsavedChanges) && !isSaving,
    // Refreshes and closed tabs can't be answered here, so they get the browser's own prompt.
    enableBeforeUnload: () => Boolean(hasUnsavedChanges),
    withResolver: true,
  })

  // Whoever opened the dialog answers it: the blocker through its own resolver, which exists
  // only while it is blocking, and an app-level guard through the handlers it passed in.
  const isRouteBlocked = blocker.status === 'blocked'
  const isOpen = isBlocked ?? isRouteBlocked
  const leave = isRouteBlocked ? blocker.proceed : onLeave
  const stay = isRouteBlocked ? blocker.reset : onStay

  if (!isOpen) {
    return null
  }

  return (
    <GenericModal
      isOpen
      onClose={stay}
      title={modalTitle}
      cancelText="Leave without saving"
      onCancel={leave}
      cancelVariant="tertiary"
      cancelDanger
      onSubmit={stay}
      submitText="Stay on page"
    >
      {modalMessage}
    </GenericModal>
  )
}

export default UnsavedChanges
