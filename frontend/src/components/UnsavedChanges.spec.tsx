import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UnsavedChanges from './UnsavedChanges'

// The component registers a route blocker. The mock keeps hold of the options it was given, so the
// tests can ask the same questions the router would, and drives the resolver behind the dialog.
let blockerOptions: {
  shouldBlockFn: () => boolean
  enableBeforeUnload: () => boolean
} | null = null
let blockerStatus: 'idle' | 'blocked' = 'idle'
const proceedMock = vi.fn()
const resetMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useBlocker: (options: { shouldBlockFn: () => boolean; enableBeforeUnload: () => boolean }) => {
    blockerOptions = options
    return { status: blockerStatus, proceed: proceedMock, reset: resetMock }
  },
}))

describe('UnsavedChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockerOptions = null
    blockerStatus = 'idle'
  })

  describe('router mode', () => {
    it('lets a navigation through while there is nothing to lose', () => {
      render(<UnsavedChanges hasUnsavedChanges={false} />)

      expect(blockerOptions?.shouldBlockFn()).toBe(false)
      expect(blockerOptions?.enableBeforeUnload()).toBe(false)
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    })

    it('blocks a navigation once there are unsaved changes', () => {
      render(<UnsavedChanges hasUnsavedChanges />)

      expect(blockerOptions?.shouldBlockFn()).toBe(true)
      expect(blockerOptions?.enableBeforeUnload()).toBe(true)
    })

    it("does not block a save's own navigation, but still warns on a refresh", () => {
      render(<UnsavedChanges hasUnsavedChanges isSaving />)

      expect(blockerOptions?.shouldBlockFn()).toBe(false)
      expect(blockerOptions?.enableBeforeUnload()).toBe(true)
    })

    it('warns with the given message when a navigation is blocked', () => {
      blockerStatus = 'blocked'
      render(<UnsavedChanges hasUnsavedChanges modalMessage="Your draft will be lost." />)

      expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
      expect(screen.getByText('Your draft will be lost.')).toBeInTheDocument()
    })

    it('abandons the changes when the user leaves', async () => {
      blockerStatus = 'blocked'
      render(<UnsavedChanges hasUnsavedChanges />)

      await userEvent.click(screen.getByRole('button', { name: 'Leave without saving' }))

      expect(proceedMock).toHaveBeenCalled()
      expect(resetMock).not.toHaveBeenCalled()
    })

    it('keeps the user on the page when they stay, and when they close the dialog', async () => {
      blockerStatus = 'blocked'
      render(<UnsavedChanges hasUnsavedChanges />)

      await userEvent.click(screen.getByRole('button', { name: 'Stay on page' }))
      await userEvent.click(screen.getByRole('button', { name: 'Close' }))

      expect(resetMock).toHaveBeenCalledTimes(2)
      expect(proceedMock).not.toHaveBeenCalled()
    })
  })

  describe('controlled mode', () => {
    const onLeave = vi.fn()
    const onStay = vi.fn()

    it('registers no route block of its own', () => {
      render(<UnsavedChanges isBlocked={false} onLeave={onLeave} onStay={onStay} />)

      expect(blockerOptions?.shouldBlockFn()).toBe(false)
      expect(blockerOptions?.enableBeforeUnload()).toBe(false)
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    })

    it('warns while the caller is holding its action', () => {
      render(
        <UnsavedChanges
          isBlocked
          onLeave={onLeave}
          onStay={onStay}
          modalTitle="Discard changes?"
          modalMessage="This tab has unsaved edits."
        />,
      )

      expect(screen.getByText('Discard changes?')).toBeInTheDocument()
      expect(screen.getByText('This tab has unsaved edits.')).toBeInTheDocument()
    })

    it('hands the answer back to the caller', async () => {
      render(<UnsavedChanges isBlocked onLeave={onLeave} onStay={onStay} />)

      await userEvent.click(screen.getByRole('button', { name: 'Leave without saving' }))
      expect(onLeave).toHaveBeenCalledTimes(1)
      expect(onStay).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: 'Stay on page' }))
      await userEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(onStay).toHaveBeenCalledTimes(2)
      expect(onLeave).toHaveBeenCalledTimes(1)
    })
  })
})
