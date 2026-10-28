import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent } from '@/test-utils'
import RecipientsModal, { getTotalRecipientCount } from './RecipientsModal'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

describe('RecipientsModal', () => {
  it('counts missing and partial channel lists', () => {
    expect(getTotalRecipientCount()).toBe(0)
    expect(getTotalRecipientCount({})).toBe(0)
    expect(getTotalRecipientCount({ email: ['one'], sms: ['two'], msgApp: ['three'] })).toBe(3)
  })
  it('shows no recipients for a missing request and closes', async () => {
    const onHide = vi.fn()
    render(<RecipientsModal show notification={null} onHide={onHide} />)
    expect(screen.getByText('No recipients found')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[1])
    expect(onHide).toHaveBeenCalled()
  })
  it('lists all channels without dropping recipients', () => {
    const notification = {
      recipients: { email: ['a@example.com'], sms: ['12345'], msgApp: ['user'] },
    } as NotificationRequest
    render(<RecipientsModal show notification={notification} onHide={vi.fn()} />)
    for (const address of ['a@example.com', '12345', 'user'])
      expect(screen.getByText(address)).toBeInTheDocument()
    expect(screen.queryByText('No recipients found')).not.toBeInTheDocument()
  })
  it('hides empty channels', () => {
    render(
      <RecipientsModal
        show
        notification={{ recipients: { email: [] } } as unknown as NotificationRequest}
        onHide={vi.fn()}
      />,
    )
    expect(screen.getByText('No recipients found')).toBeInTheDocument()
    expect(screen.queryByText(/Email Recipients/)).not.toBeInTheDocument()
  })
})
