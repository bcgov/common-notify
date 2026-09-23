import React from 'react'
import type { FC, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@bcgov/design-system-react-components'

interface GenericModalProps {
  /**
   * Controls whether the modal is visible
   */
  isOpen: boolean

  /**
   * Callback when modal should close (user clicks X, Cancel, or clicks outside)
   */
  onClose: () => void

  /**
   * Modal title displayed in header
   */
  title: string

  /**
   * Modal content (form fields, text, etc.)
   */
  children: ReactNode

  /**
   * Optional callback for submit action
   * If provided, a "Submit" button will be shown
   */
  onSubmit?: (e: React.FormEvent) => void | Promise<void>

  /**
   * Text for the primary submit button
   * @default 'Submit'
   */
  submitText?: string

  /**
   * Variant for submit button
   * @default 'primary'
   */
  submitVariant?: 'link' | 'primary' | 'secondary' | 'tertiary'

  /**
   * Whether submit button should be disabled
   * @default false
   */
  isSubmitLoading?: boolean

  /**
   * Text for cancel button
   * @default 'Cancel'
   */
  cancelText?: string

  /**
   * Callback for the cancel button, for the dialogs where cancelling and closing are not
   * the same thing (e.g. "Leave without saving" next to an X that keeps the user put).
   * @default onClose
   */
  onCancel?: () => void

  /**
   * Variant for the cancel button, alongside a submit button
   * @default 'secondary'
   */
  cancelVariant?: 'link' | 'primary' | 'secondary' | 'tertiary'

  /**
   * Whether the cancel button reads as destructive, alongside a submit button
   * @default false
   */
  cancelDanger?: boolean

  /**
   * Modal size
   * @default 'modal-dialog-centered'
   */
  size?: 'sm' | 'lg' | 'xl'

  /**
   * Whether to close on backdrop click
   * @default true
   */
  closeOnBackdropClick?: boolean
}

/**
 * GenericModal Component
 *
 * Reusable modal dialog component for forms and confirmations.
 * Can be used anywhere in the application with consistent styling and behavior.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 *
 * <GenericModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Create User"
 *   onSubmit={handleCreateUser}
 *   submitText="Create"
 *   isSubmitLoading={loading}
 * >
 *   <TextField label="Name" value={name} onChange={setName} />
 * </GenericModal>
 * ```
 */
const GenericModal: FC<GenericModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  onSubmit,
  submitText = 'Submit',
  submitVariant = 'primary',
  isSubmitLoading = false,
  cancelText = 'Cancel',
  onCancel,
  cancelVariant = 'secondary',
  cancelDanger = false,
  size = 'modal-dialog-centered',
  closeOnBackdropClick: _closeOnBackdropClick = true,
}) => {
  const sizeClass =
    size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''

  // Rendered into document.body rather than inline.
  //
  // A modal invoked from inside a <form> would otherwise put this component's own <form>
  // inside that one, and browsers refuse to submit a form nested in another form — the
  // submit button silently does nothing, firing neither handler. (jsdom does not
  // implement that rule, so it only shows up in a real browser.) Portalling also keeps
  // the fixed-position dialog out of any ancestor's stacking or overflow context.
  //
  // React portals still propagate events through the React tree, so onSubmit/onClose and
  // any surrounding context behave exactly as before.
  const modal = (
    <>
      {isOpen && <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} />}
      <div
        className={`modal ${isOpen ? 'show' : ''}`}
        style={{ display: isOpen ? 'block' : 'none', zIndex: 1050 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className={`modal-dialog ${size} ${sizeClass}`}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="modal-title">
                {title}
              </h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body">
              {onSubmit ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    // React portals propagate events through the React tree, not the DOM
                    // tree, so without this a modal opened from inside a form would submit
                    // that form too — silently saving whatever the user had half-edited
                    // behind the dialog.
                    event.stopPropagation()
                    return onSubmit(event)
                  }}
                  className="d-flex flex-column gap-3"
                >
                  {children}
                  <div className="d-flex gap-2 justify-content-end">
                    <Button
                      type="button"
                      variant={cancelVariant}
                      danger={cancelDanger}
                      onClick={onCancel ?? onClose}
                      isDisabled={isSubmitLoading}
                    >
                      {cancelText}
                    </Button>
                    <Button type="submit" variant={submitVariant} isDisabled={isSubmitLoading}>
                      {isSubmitLoading ? `${submitText}...` : submitText}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  {children}
                  <div className="d-flex gap-2 justify-content-end mt-3">
                    <Button variant="primary" onClick={onCancel ?? onClose}>
                      {cancelText}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )

  return createPortal(modal, document.body)
}

export default GenericModal
