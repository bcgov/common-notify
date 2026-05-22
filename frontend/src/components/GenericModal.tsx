import React from 'react'
import type { FC, ReactNode } from 'react'
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
  size = 'modal-dialog-centered',
  closeOnBackdropClick: _closeOnBackdropClick = true,
}) => {
  const sizeClass =
    size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''

  return (
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
                <form onSubmit={onSubmit} className="d-flex flex-column gap-3">
                  {children}
                  <div className="d-flex gap-2 justify-content-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onClose}
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
                    <Button variant="secondary" onClick={onClose}>
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
}

export default GenericModal
