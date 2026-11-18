import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TenantRequestCard from './TenantRequestCard'
import type { TenantRequest } from '@/api/tenantRequests.api'

const request = (overrides: Partial<TenantRequest> = {}): TenantRequest => ({
  id: 'req-1',
  tenantId: 'tenant-1',
  tenantName: 'Parks',
  requestTypeCode: 'sms_number',
  statusCode: 'pending',
  requestedBy: 'Terry User',
  requestedAt: '2026-11-16T18:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  decisionReason: null,
  outcome: null,
  releasedBy: null,
  releasedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  ...overrides,
})

describe('TenantRequestCard', () => {
  it('shows the status, type, who asked, and the details and action it is given', () => {
    render(
      <TenantRequestCard
        request={request()}
        typeLabel="Number request"
        details="A Notify administrator will review it."
        action={<button type="button">Cancel request</button>}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Number request')).toBeInTheDocument()
    expect(screen.getByText(/Requested by Terry User on/)).toBeInTheDocument()
    expect(screen.getByText('A Notify administrator will review it.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument()
    // Still open, so nothing to dismiss.
    expect(screen.queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument()
  })

  it("quotes the admin's reason for a rejection, and lets the tenant dismiss it", async () => {
    const onDismiss = vi.fn()
    render(
      <TenantRequestCard
        request={request({
          statusCode: 'rejected',
          decidedBy: 'Pat Admin',
          decidedAt: '2026-11-18T18:00:00.000Z',
          decisionReason: 'Not needed',
        })}
        typeLabel="Number request"
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByText(/Rejected by Pat Admin on/)).toBeInTheDocument()
    expect(screen.getByText('Not needed').tagName).toBe('BLOCKQUOTE')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss rejected request' }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('says who cancelled or released a request', () => {
    const { rerender } = render(
      <TenantRequestCard
        request={request({
          statusCode: 'cancelled',
          cancelledBy: 'Terry User',
          cancelledAt: '2026-11-18T18:00:00.000Z',
        })}
        typeLabel="Number request"
      />,
    )
    expect(screen.getByText(/Cancelled by Terry User on/)).toBeInTheDocument()

    rerender(
      <TenantRequestCard
        request={request({
          statusCode: 'released',
          releasedBy: 'Pat Admin',
          releasedAt: '2026-11-18T18:00:00.000Z',
        })}
        typeLabel="Number request"
      />,
    )
    expect(screen.getByText(/Released by Pat Admin on/)).toBeInTheDocument()
  })

  it('offers no dismiss without a handler, e.g. to a user who cannot edit', () => {
    render(
      <TenantRequestCard
        request={request({ statusCode: 'rejected' })}
        typeLabel="Number request"
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
