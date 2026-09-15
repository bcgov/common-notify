import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventTabs from './EventTabs'

const TAB_NAMES = [
  'Event Settings',
  'Email Notification',
  'SMS Notification',
  'Third-party Notification',
]

describe('EventTabs', () => {
  it('offers every tab, in order', () => {
    render(<EventTabs selected="settings" />)

    expect(screen.getAllByRole('radio').map((tab) => tab.textContent)).toEqual(TAB_NAMES)
  })

  it('marks the selected tab as the chosen one', () => {
    render(<EventTabs selected="email" />)

    expect(screen.getByRole('radio', { name: 'Email Notification' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Event Settings' })).not.toBeChecked()
  })

  it('reports the tab that was chosen', async () => {
    const onSelect = vi.fn()
    render(<EventTabs selected="settings" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('radio', { name: 'SMS Notification' }))

    expect(onSelect).toHaveBeenCalledWith('sms')
  })

  it('does not report the tab that is already open', async () => {
    const onSelect = vi.fn()
    render(<EventTabs selected="settings" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Event Settings' }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('disables the tabs it is told cannot be opened yet', async () => {
    const onSelect = vi.fn()
    render(
      <EventTabs
        selected="settings"
        onSelect={onSelect}
        disabledTabs={['email', 'sms', 'third-party']}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Email Notification' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Event Settings' })).toBeEnabled()

    await userEvent.click(screen.getByRole('radio', { name: 'Email Notification' }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still renders the tabs when there is nowhere to navigate to', () => {
    render(<EventTabs selected="settings" />)

    expect(screen.getAllByRole('radio')).toHaveLength(TAB_NAMES.length)
  })
})
