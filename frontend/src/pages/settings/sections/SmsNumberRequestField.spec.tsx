import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SmsNumberRequestField from './SmsNumberRequestField'
import {
  cancelMySmsNumberRequest,
  dismissMySmsNumberRequest,
  getMySmsNumberRequest,
  releaseMySmsNumber,
  requestSmsNumber,
} from '@/api/smsNumbers.api'
import type { SmsNumberRequest } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

let state: { tenant: { selectedTenant: { id: string } | null } }

vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))
vi.mock('@/api/smsNumbers.api', () => ({
  getMySmsNumberRequest: vi.fn(),
  requestSmsNumber: vi.fn(),
  releaseMySmsNumber: vi.fn(),
  cancelMySmsNumberRequest: vi.fn(),
  dismissMySmsNumberRequest: vi.fn(),
}))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }))

const request = (overrides: Partial<SmsNumberRequest> = {}): SmsNumberRequest => ({
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
  phoneNumber: null,
  usesDefaultNumber: false,
  releasedBy: null,
  releasedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  ...overrides,
})

/** What the endpoint returns: the request, and the number in use meanwhile. */
const status = (
  latest: SmsNumberRequest | null,
  overrides: { senderNumber?: string | null; testEnvironment?: boolean } = {},
) => ({ request: latest, senderNumber: '+15550009999', testEnvironment: false, ...overrides })

describe('SmsNumberRequestField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state = { tenant: { selectedTenant: { id: 'tenant-1' } } }
  })

  it('offers to request a number when the tenant has never asked', async () => {
    // Read again after the action, as the backend would answer it.
    vi.mocked(getMySmsNumberRequest)
      .mockResolvedValueOnce(status(null))
      .mockResolvedValue(status(request()))
    vi.mocked(requestSmsNumber).mockResolvedValue(request())
    render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(await screen.findByText('+15550009999')).toBeInTheDocument()
    expect(screen.getByText('(shared Notify number)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Request an SMS number' }))

    expect(requestSmsNumber).toHaveBeenCalled()
    expect(await screen.findByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/Requested by Terry User/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument()
    expect(showSuccessToast).toHaveBeenCalledWith('SMS number requested')
  })

  it('cancels a pending request, after which the tenant can ask again', async () => {
    const cancelled = request({
      statusCode: 'cancelled',
      cancelledBy: 'Terry User',
      cancelledAt: '2026-11-18T18:00:00.000Z',
    })
    vi.mocked(getMySmsNumberRequest)
      .mockResolvedValueOnce(status(request()))
      .mockResolvedValue(status(cancelled))
    vi.mocked(cancelMySmsNumberRequest).mockResolvedValue(cancelled)
    render(<SmsNumberRequestField canEdit smsEnabled />)

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request' }))

    expect(cancelMySmsNumberRequest).toHaveBeenCalledWith('req-1')
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText(/Cancelled by Terry User on/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request another number' })).toBeInTheDocument()
    expect(showSuccessToast).toHaveBeenCalledWith('SMS number request cancelled')
  })

  it('shows the assigned number once approved, and releases it after confirming', async () => {
    const approved = request({ statusCode: 'approved', phoneNumber: '+15814360804' })
    const released = {
      ...approved,
      statusCode: 'released' as const,
      releasedAt: '2026-11-18T18:00:00.000Z',
    }
    vi.mocked(getMySmsNumberRequest)
      .mockResolvedValueOnce(status(approved, { senderNumber: '+15814360804' }))
      .mockResolvedValue(status(released))
    vi.mocked(releaseMySmsNumber).mockResolvedValue(released)
    render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(await screen.findByText('+15814360804')).toBeInTheDocument()
    expect(screen.getByText('(your number)')).toBeInTheDocument()
    // The request has done its job, so no card, just Release.
    expect(screen.queryByText('Approved')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Release number' }))
    expect(releaseMySmsNumber).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release number' }))

    expect(releaseMySmsNumber).toHaveBeenCalledWith('req-1')
    expect(await screen.findByText('Released')).toBeInTheDocument()
    expect(
      screen.getByText('+15814360804 is no longer assigned to this tenant.'),
    ).toBeInTheDocument()
    expect(screen.getByText('(shared Notify number)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request another number' })).toBeInTheDocument()
  })

  it('says an approval on the default number keeps the shared number', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(
      status(request({ statusCode: 'approved', usesDefaultNumber: true })),
    )
    render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(
      await screen.findByText(
        'Your request was approved on the shared number for this environment.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('(shared Notify number)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Release number' })).toBeInTheDocument()
  })

  it('says which number is used while a request is pending', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(status(request()))
    render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(await screen.findByText('A Notify administrator will review it.')).toBeInTheDocument()
    expect(screen.getByText('+15550009999')).toBeInTheDocument()
    expect(screen.getByText('(shared Notify number)')).toBeInTheDocument()
  })

  it('explains the shared test number in a test environment while SMS is on', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(status(null, { testEnvironment: true }))
    const { unmount } = render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(
      await screen.findByText('Test environment: every tenant shares this number.'),
    ).toBeInTheDocument()
    // Requesting still works there.
    expect(screen.getByRole('button', { name: 'Request an SMS number' })).toBeInTheDocument()
    unmount()

    render(<SmsNumberRequestField canEdit smsEnabled={false} />)
    await screen.findByRole('button', { name: 'Request an SMS number' })
    expect(screen.queryByText(/Test environment/)).not.toBeInTheDocument()
  })

  it('drops the test-environment note once the tenant has a number of its own', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(
      status(request({ statusCode: 'approved', phoneNumber: '+12364995305' }), {
        senderNumber: '+12364995305',
        testEnvironment: true,
      }),
    )
    render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(await screen.findByText('(your number)')).toBeInTheDocument()
    expect(screen.queryByText(/Test environment/)).not.toBeInTheDocument()
  })

  it('explains an approval on the shared default number in place of the test note', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(
      status(request({ statusCode: 'approved', usesDefaultNumber: true }), {
        testEnvironment: true,
      }),
    )
    render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(await screen.findByText(/approved on the shared number/)).toBeInTheDocument()
    expect(screen.queryByText(/Test environment/)).not.toBeInTheDocument()
  })

  it('shows no test-environment note in prod', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(status(null))
    render(<SmsNumberRequestField canEdit smsEnabled />)

    await screen.findByRole('button', { name: 'Request an SMS number' })
    expect(screen.queryByText(/Test environment/)).not.toBeInTheDocument()
  })

  it("shows the admin's reason for a rejection", async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(
      status(
        request({
          statusCode: 'rejected',
          decisionReason: 'Describe your opt-out steps',
          decidedBy: 'Pat Admin',
          decidedAt: '2026-11-18T18:00:00.000Z',
        }),
      ),
    )
    render(<SmsNumberRequestField canEdit smsEnabled />)

    expect(await screen.findByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText('Describe your opt-out steps')).toBeInTheDocument()
    expect(screen.getByText(/Rejected by Pat Admin on/)).toBeInTheDocument()
  })

  it('dismisses a rejected request, so the tenant is offered a fresh one', async () => {
    vi.mocked(getMySmsNumberRequest)
      .mockResolvedValueOnce(
        status(request({ statusCode: 'rejected', decisionReason: 'Not needed' })),
      )
      .mockResolvedValue(status(null))
    vi.mocked(dismissMySmsNumberRequest).mockResolvedValue(undefined)
    render(<SmsNumberRequestField canEdit smsEnabled />)

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss rejected request' }))

    expect(dismissMySmsNumberRequest).toHaveBeenCalledWith('req-1')
    expect(await screen.findByRole('button', { name: 'Request an SMS number' })).toBeInTheDocument()
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument()
    expect(showSuccessToast).toHaveBeenCalledWith('SMS number request dismissed')
  })

  it('offers no dismiss while a request is pending or approved', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(status(request()))
    const { unmount } = render(<SmsNumberRequestField canEdit smsEnabled />)
    expect(await screen.findByRole('button', { name: 'Cancel request' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument()
    unmount()

    vi.mocked(getMySmsNumberRequest).mockResolvedValue(
      status(request({ statusCode: 'approved', phoneNumber: '+15550001111' })),
    )
    render(<SmsNumberRequestField canEdit smsEnabled />)
    expect(await screen.findByRole('button', { name: 'Release number' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument()
  })

  it('shows the status but no actions without the operations admin role', async () => {
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(status(request()))
    render(<SmsNumberRequestField canEdit={false} smsEnabled />)

    expect(await screen.findByText('Pending')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('reports a failed load, and a failed action as a toast', async () => {
    vi.mocked(getMySmsNumberRequest).mockRejectedValueOnce(
      new Error('Failed to load SMS number request: down'),
    )
    const { unmount } = render(<SmsNumberRequestField canEdit smsEnabled />)
    expect(await screen.findByText('Failed to load SMS number request: down')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    unmount()

    vi.mocked(getMySmsNumberRequest).mockResolvedValue(status(null))
    vi.mocked(requestSmsNumber).mockRejectedValue(
      new Error('Failed to request an SMS number: conflict'),
    )
    render(<SmsNumberRequestField canEdit smsEnabled />)
    await userEvent.click(await screen.findByRole('button', { name: 'Request an SMS number' }))
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith('Failed to request an SMS number: conflict'),
    )
  })

  it('waits for a selected tenant, and reloads when it changes', async () => {
    state = { tenant: { selectedTenant: null } }
    vi.mocked(getMySmsNumberRequest).mockResolvedValue(status(null))
    const { rerender } = render(<SmsNumberRequestField canEdit smsEnabled />)
    expect(getMySmsNumberRequest).not.toHaveBeenCalled()

    state = { tenant: { selectedTenant: { id: 'tenant-2' } } }
    rerender(<SmsNumberRequestField canEdit smsEnabled />)
    await waitFor(() => expect(getMySmsNumberRequest).toHaveBeenCalledTimes(1))
  })
})
