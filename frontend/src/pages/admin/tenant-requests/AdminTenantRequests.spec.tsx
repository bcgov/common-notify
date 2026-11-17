import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor, within } from '@/test-utils'
import AdminTenantRequests from './AdminTenantRequests'
import {
  approveTenantRequest,
  getTenantRequestCodes,
  getTenantRequests,
  rejectTenantRequest,
  releaseTenantRequest,
} from '@/api/tenantRequests.api'
import type { TenantRequest } from '@/api/tenantRequests.api'
import { getSmsNumberCodes, getSmsNumbers } from '@/api/smsNumbers.api'
import type { SmsNumber } from '@/api/smsNumbers.api'
import { showSuccessToast } from '@/redux/utils/toastUtils'

vi.mock('@/api/tenantRequests.api', () => ({
  getTenantRequests: vi.fn(),
  getTenantRequestCodes: vi.fn(),
  approveTenantRequest: vi.fn(),
  rejectTenantRequest: vi.fn(),
  releaseTenantRequest: vi.fn(),
}))
vi.mock('@/api/smsNumbers.api', () => ({
  getSmsNumbers: vi.fn(),
  getSmsNumberCodes: vi.fn(),
}))
const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({
      adminTenants: {
        notifyOptions: [
          { id: 'tenant-parks', name: 'Parks' },
          { id: 'tenant-roads', name: 'Roads' },
        ],
      },
    }),
  useAppDispatch: () => mocks.dispatch,
}))
vi.mock('@/redux/thunks/adminTenants.thunks', () => ({
  fetchNotifyTenantOptions: () => ({ type: 'adminTenants/fetchNotifyOptions' }),
}))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }))

const request = (overrides: Partial<TenantRequest>): TenantRequest => ({
  id: 'req-1',
  tenantId: 'tenant-roads',
  tenantName: 'Roads',
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
const code = (value: string, description: string) => ({ code: value, description })
const twilioNumber: SmsNumber = {
  id: 'num-twilio',
  phoneNumber: '+15551230000',
  providerCode: 'twilio',
  numberTypeCode: 'long_code',
  description: null,
  isDefault: false,
  tenants: [],
}

/** A requests page as the API returns it. */
const pageOf = (data: TenantRequest[], count = data.length) => ({
  data,
  count,
  page: 1,
  limit: 15,
  totalPages: Math.ceil(count / 15),
})

/** The query the table last asked for. */
const lastQuery = () => vi.mocked(getTenantRequests).mock.lastCall?.[0]

function setup({
  requests = [
    request({
      id: 'req-old',
      tenantName: 'Parks',
      statusCode: 'approved',
      requestedAt: '2026-11-17T18:00:00.000Z',
      decidedBy: 'Pat Admin',
      decidedAt: '2026-11-17T19:00:00.000Z',
      outcome: '+15814360804',
    }),
    request({}),
  ],
  count,
  defaultNumberAssignable = false,
}: {
  requests?: TenantRequest[]
  /** The total across every page, when more than this page holds. */
  count?: number
  defaultNumberAssignable?: boolean
} = {}) {
  vi.mocked(getTenantRequests).mockResolvedValue(pageOf(requests, count))
  vi.mocked(getTenantRequestCodes).mockResolvedValue({
    types: [code('sms_number', 'SMS number'), code('priority_lane', 'Priority lane')],
    statuses: [],
  })
  vi.mocked(getSmsNumbers).mockResolvedValue([twilioNumber])
  vi.mocked(getSmsNumberCodes).mockResolvedValue({
    providers: [code('aws', 'AWS End User Messaging'), code('twilio', 'Twilio')],
    numberTypes: [code('long_code', 'Long code')],
    activeProvider: 'aws',
    defaultNumber: '+15550009999',
    defaultNumberAssignable,
  })
  return render(<AdminTenantRequests />)
}

async function chooseAction(menuLabel: string, action: string) {
  await userEvent.click(await screen.findByRole('button', { name: menuLabel }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

async function chooseOption(fieldLabel: RegExp, option: string) {
  await userEvent.click(screen.getByRole('button', { name: fieldLabel }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function filterColumn(column: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: `Column options for ${column}` }))
  await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: option }))
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
}

describe('AdminTenantRequests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for pending requests of every type, showing what each is for', async () => {
    setup()

    const table = await screen.findByRole('table', { name: 'Tenant requests' })
    const roads = await within(table).findByRole('row', { name: /Roads/ })
    expect(lastQuery()).toEqual({
      page: 1,
      limit: 15,
      search: undefined,
      filter: ['statusCode:in:pending'],
    })
    await waitFor(() => expect(within(roads).getByText('SMS number')).toBeInTheDocument())
    expect(within(table).getByRole('row', { name: /Parks/ })).toBeInTheDocument()
  })

  it('filters on other statuses and on type from the column headers', async () => {
    setup()
    await screen.findByRole('table', { name: 'Tenant requests' })

    await filterColumn('Status', 'Approved')
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ page: 1, filter: ['statusCode:in:pending|approved'] }),
    )

    await filterColumn('Type', 'SMS number')
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        filter: ['statusCode:in:pending|approved', 'requestTypeCode:in:sms_number'],
      }),
    )
  })

  it('searches by tenant name, suggesting tenants as you type', async () => {
    setup()
    await screen.findByRole('table', { name: 'Tenant requests' })

    await userEvent.type(screen.getByRole('combobox', { name: 'Search requests by tenant' }), 'Ro')
    await userEvent.click(await screen.findByRole('option', { name: 'Roads' }))

    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1, search: 'Roads' }))
  })

  it('pages through requests, asking once on arrival', async () => {
    setup({ requests: [request({})], count: 40 })
    expect(await screen.findAllByText(/of 40 items/)).not.toHaveLength(0)
    expect(getTenantRequests).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }))
  })

  it('shows who decided a request, what it granted, and who released it', async () => {
    setup({
      requests: [
        request({
          statusCode: 'released',
          decidedBy: 'Pat Admin',
          decidedAt: '2026-11-17T19:00:00.000Z',
          outcome: '+15814360804',
          releasedBy: 'Terry User',
          releasedAt: '2026-11-18T19:00:00.000Z',
        }),
        request({
          id: 'req-3',
          tenantName: 'Lands',
          statusCode: 'cancelled',
          cancelledBy: 'Terry User',
          cancelledAt: '2026-11-18T19:00:00.000Z',
        }),
        request({
          id: 'req-2',
          tenantName: 'Parks',
          statusCode: 'rejected',
          decidedBy: 'Pat Admin',
          decidedAt: '2026-11-17T19:00:00.000Z',
          decisionReason: 'No opt-out steps',
        }),
      ],
    })

    const table = await screen.findByRole('table', { name: 'Tenant requests' })
    const released = await within(table).findByRole('row', { name: /Roads/ })
    expect(within(released).getByText('+15814360804')).toBeInTheDocument()
    expect(within(released).getByText(/Approved by Pat Admin/)).toBeInTheDocument()
    expect(within(released).getByText(/Released by Terry User/)).toBeInTheDocument()
    const rejected = within(table).getByRole('row', { name: /Parks/ })
    expect(within(rejected).getByText('No opt-out steps')).toBeInTheDocument()
    expect(within(rejected).getByText(/Rejected by Pat Admin/)).toBeInTheDocument()
    const cancelled = within(table).getByRole('row', { name: /Lands/ })
    expect(within(cancelled).getByText(/Cancelled by Terry User/)).toBeInTheDocument()
    // None has anything left to do.
    expect(screen.queryByRole('button', { name: /request$/ })).toBeNull()
  })

  it('approves an SMS number request by assigning the chosen number, then reloads', async () => {
    vi.mocked(approveTenantRequest).mockResolvedValue(
      request({ statusCode: 'approved', outcome: '+15551230000' }),
    )
    setup()

    await chooseAction("Actions for Roads's request", 'Approve')
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Select a number to assign.')).toBeInTheDocument()
    expect(approveTenantRequest).not.toHaveBeenCalled()

    await chooseOption(/Number/, '+15551230000 (Twilio)')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() =>
      expect(approveTenantRequest).toHaveBeenCalledWith('req-1', { smsNumberId: 'num-twilio' }),
    )
    expect(showSuccessToast).toHaveBeenCalledWith('Approved: Roads now sends from +15551230000')
    await waitFor(() => expect(getTenantRequests).toHaveBeenCalledTimes(2))
  })

  it('offers the default number when approving outside prod, and not otherwise', async () => {
    vi.mocked(approveTenantRequest).mockResolvedValue(
      request({ statusCode: 'approved', outcome: 'Default number' }),
    )
    const { unmount } = setup()
    await chooseAction("Actions for Roads's request", 'Approve')
    await screen.findByRole('dialog')
    await waitFor(() => expect(getSmsNumbers).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /Number/ }))
    expect(await screen.findByRole('option', { name: /Twilio/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Default number/ })).not.toBeInTheDocument()
    unmount()

    setup({ defaultNumberAssignable: true })
    await chooseAction("Actions for Roads's request", 'Approve')
    await screen.findByRole('dialog')
    await chooseOption(/Number/, 'Default number (+15550009999)')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() =>
      expect(approveTenantRequest).toHaveBeenCalledWith('req-1', { useDefaultNumber: true }),
    )
    expect(showSuccessToast).toHaveBeenCalledWith('Approved: Roads now sends from Default number')
  })

  it('approves a type with nothing to choose after a plain confirmation', async () => {
    vi.mocked(approveTenantRequest).mockResolvedValue(request({ statusCode: 'approved' }))
    setup({ requests: [request({ requestTypeCode: 'priority_lane' })] })

    await chooseAction("Actions for Roads's request", 'Approve')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/asked for Priority lane/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(approveTenantRequest).toHaveBeenCalledWith('req-1'))
    expect(showSuccessToast).toHaveBeenCalledWith("Roads's request approved")
  })

  it('rejects a request only with a reason', async () => {
    vi.mocked(rejectTenantRequest).mockResolvedValue(request({ statusCode: 'rejected' }))
    setup()

    await chooseAction("Actions for Roads's request", 'Reject')
    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }))
    expect(await screen.findByText('Enter a reason for rejecting the request.')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'No opt-out steps')
    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }))

    await waitFor(() =>
      expect(rejectTenantRequest).toHaveBeenCalledWith('req-1', 'No opt-out steps'),
    )
  })

  it('releases an approved request after confirming what that does', async () => {
    vi.mocked(releaseTenantRequest).mockResolvedValue(request({ statusCode: 'released' }))
    setup()

    await chooseAction("Actions for Parks's request", 'Release')
    const dialog = await screen.findByRole('dialog', { name: "Release Parks's SMS number" })
    expect(within(dialog).getByText(/shared default number/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release' }))

    await waitFor(() => expect(releaseTenantRequest).toHaveBeenCalledWith('req-old'))
    expect(showSuccessToast).toHaveBeenCalledWith("Parks's SMS number released")
  })

  it('shows the no-data card when nothing is pending, offering all requests', async () => {
    setup({ requests: [] })

    expect(await screen.findByText('No pending requests.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tenant requests' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show all requests' }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ filter: undefined }))
    expect(await screen.findByText('No tenant requests yet.')).toBeInTheDocument()
  })

  it("keeps the table's own empty state for a search with no matches", async () => {
    setup()
    await screen.findByRole('table', { name: 'Tenant requests' })
    vi.mocked(getTenantRequests).mockResolvedValue(pageOf([]))

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Search requests by tenant' }),
      'nobody{Enter}',
    )

    expect(
      await screen.findAllByText('No results found. Try a different search.'),
    ).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('shows a failed load as an alert', async () => {
    vi.mocked(getTenantRequests).mockRejectedValue(
      new Error('Failed to load tenant requests: down'),
    )
    vi.mocked(getTenantRequestCodes).mockResolvedValue({ types: [], statuses: [] })
    render(<AdminTenantRequests />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load tenant requests: down',
    )
  })
})
