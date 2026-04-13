import { toast } from 'react-toastify'
import type { Toast } from '@/redux/slices/toast.slice'

/**
 * Show a success toast notification
 */
export const showSuccessToast = (message: string, options?: Omit<Toast, 'message' | 'type'>) => {
  toast.success(message, {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}

/**
 * Show an error toast notification
 */
export const showErrorToast = (message: string, options?: Omit<Toast, 'message' | 'type'>) => {
  toast.error(message, {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}

/**
 * Show an info toast notification
 */
export const showInfoToast = (message: string, options?: Omit<Toast, 'message' | 'type'>) => {
  toast.info(message, {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}

/**
 * Show a warning toast notification
 */
export const showWarningToast = (message: string, options?: Omit<Toast, 'message' | 'type'>) => {
  toast.warning(message, {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}
