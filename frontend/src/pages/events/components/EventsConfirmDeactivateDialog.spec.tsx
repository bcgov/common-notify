import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsConfirmDeactivateDialog from './EventsConfirmDeactivateDialog'

describe('EventsConfirmDeactivateDialog', () => {
  it('cancels when dismissed with Escape', async () => {
    const onCancel = vi.fn()
    render(
      <EventsConfirmDeactivateDialog
        isOpen
        isBusy={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Deactivate this channel?')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalled()
  })

  it('confirms and cancels from its buttons', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(
      <EventsConfirmDeactivateDialog
        isOpen
        isBusy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })
})
