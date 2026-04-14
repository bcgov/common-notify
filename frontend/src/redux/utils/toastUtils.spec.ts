import { describe, it, expect, vi } from 'vitest'
import { toast } from 'react-toastify'
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from './toastUtils'

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

describe('Toast Utilities', () => {
  describe('showSuccessToast', () => {
    it('should call toast.success with message and default options', () => {
      const message = 'Success!'

      showSuccessToast(message)

      expect(toast.success).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          position: 'top-right',
          autoClose: 5000,
        }),
      )
    })

    it('should merge custom options with defaults', () => {
      const message = 'Success!'
      const customOptions = { autoClose: 3000 }

      showSuccessToast(message, customOptions)

      expect(toast.success).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          position: 'top-right',
          autoClose: 3000, // Custom value overrides default
        }),
      )
    })
  })

  describe('showErrorToast', () => {
    it('should call toast.error with message and default options', () => {
      const message = 'Error!'

      showErrorToast(message)

      expect(toast.error).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          position: 'top-right',
          autoClose: 5000,
        }),
      )
    })
  })

  describe('showInfoToast', () => {
    it('should call toast.info with message and default options', () => {
      const message = 'Info'

      showInfoToast(message)

      expect(toast.info).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          position: 'top-right',
          autoClose: 5000,
        }),
      )
    })
  })

  describe('showWarningToast', () => {
    it('should call toast.warning with message and default options', () => {
      const message = 'Warning!'

      showWarningToast(message)

      expect(toast.warning).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          position: 'top-right',
          autoClose: 5000,
        }),
      )
    })
  })

  describe('Common toast options', () => {
    it('all toast functions should have consistent default options', () => {
      const message = 'Test'
      const expectedDefaults = {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      }

      showSuccessToast(message)
      showErrorToast(message)
      showInfoToast(message)
      showWarningToast(message)
      ;[toast.success, toast.error, toast.info, toast.warning].forEach((toastFn) => {
        expect(toastFn).toHaveBeenCalledWith(message, expect.objectContaining(expectedDefaults))
      })
    })
  })
})
