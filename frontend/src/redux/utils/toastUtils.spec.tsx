import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { toast } from 'react-toastify'
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from './toastUtils'

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const helpers = [
  ['showSuccessToast', showSuccessToast, toast.success],
  ['showErrorToast', showErrorToast, toast.error],
  ['showInfoToast', showInfoToast, toast.info],
  ['showWarningToast', showWarningToast, toast.warning],
] as const

describe('Toast Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(helpers)('%s renders the message and the shared defaults', (_name, show, spy) => {
    show('Notifications queued.')

    expect(spy).toHaveBeenCalledTimes(1)
    const [node, options] = vi.mocked(spy).mock.calls[0]

    render(<>{node}</>)
    expect(screen.getByText('Notifications queued.')).toBeInTheDocument()
    expect(options).toEqual(
      expect.objectContaining({
        // Toasts sit bottom-right across the app, matching the designs.
        position: 'bottom-right',
        autoClose: 5000,
        hideProgressBar: true,
      }),
    )
  })

  it.each(helpers)('%s renders an optional description under the message', (_name, show, spy) => {
    show('Sample CSV downloaded.', 'Complete the file and upload it to continue.')

    const [node] = vi.mocked(spy).mock.calls[0]
    render(<>{node}</>)

    expect(screen.getByText('Sample CSV downloaded.')).toBeInTheDocument()
    expect(screen.getByText('Complete the file and upload it to continue.')).toBeInTheDocument()
  })

  it('lets a caller override the defaults', () => {
    showSuccessToast('Saved.', undefined, { autoClose: 3000 })

    const [, options] = vi.mocked(toast.success).mock.calls[0]
    expect(options).toEqual(expect.objectContaining({ position: 'bottom-right', autoClose: 3000 }))
  })
})
