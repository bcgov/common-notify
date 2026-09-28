import { toast } from 'react-toastify'
import type { ToastOptions } from 'react-toastify'

/**
 * Toasts sit bottom-right and read as a short headline with optional supporting detail, matching
 * the pattern in the designs. `description` is optional so the 30-odd existing single-message
 * callers are unaffected.
 */
const BASE_OPTIONS: ToastOptions = {
  position: 'bottom-right',
  autoClose: 5000,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
}

function body(message: string, description?: string) {
  if (!description) {
    return <span className="toast__title">{message}</span>
  }

  return (
    <span className="toast__body">
      <span className="toast__title">{message}</span>
      <span className="toast__description">{description}</span>
    </span>
  )
}

/** Show a success toast notification */
export const showSuccessToast = (message: string, description?: string, options?: ToastOptions) => {
  toast.success(body(message, description), { ...BASE_OPTIONS, ...options })
}

/** Show an error toast notification */
export const showErrorToast = (message: string, description?: string, options?: ToastOptions) => {
  toast.error(body(message, description), { ...BASE_OPTIONS, ...options })
}

/** Show an info toast notification */
export const showInfoToast = (message: string, description?: string, options?: ToastOptions) => {
  toast.info(body(message, description), { ...BASE_OPTIONS, ...options })
}

/** Show a warning toast notification */
export const showWarningToast = (message: string, description?: string, options?: ToastOptions) => {
  toast.warning(body(message, description), { ...BASE_OPTIONS, ...options })
}
