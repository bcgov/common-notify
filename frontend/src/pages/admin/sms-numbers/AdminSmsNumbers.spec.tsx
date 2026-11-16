import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor, within } from '@/test-utils'
import AdminSmsNumbers from './AdminSmsNumbers'
import {
  approveSmsNumberRequest,
  assignSmsNumber,
  clearDefaultSmsNumber,
  createSmsNumber,
  deleteSmsNumber,
  getSmsNumberCodes,
  getSmsNumberRequests,
  getSmsNumbers,
  rejectSmsNumberRequest,
  releaseSmsNumberRequest,
  setDefaultSmsNumber,
  unassignSmsNumber,
} from '@/api/smsNumbers.api'
import type { SmsNumber, SmsNumberRequest } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

vi.mock('@/api/smsNumbers.api', () => ({
  getSmsNumbers: vi.fn(),
  getSmsNumberRequests: vi.fn(),
  getSmsNumberCodes: vi.fn(),
  createSmsNumber: vi.fn(),
  updateSmsNumber: vi.fn(),
  deleteSmsNumber: vi.fn(),
  assignSmsNumber: vi.fn(),
  unassignSmsNumber: vi.fn(),
  approveSmsNumberRequest: vi.fn(),
  rejectSmsNumberRequest: vi.fn(),
  releaseSmsNumberRequest: vi.fn(),
  setDefaultSmsNumber: vi.fn(),
  clearDefaultSmsNumber: vi.fn(),
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

const awsNumber: SmsNumber = {
  id: 'num-aws',
  phoneNumber: '+15814360804',
  providerCode: 'aws',
  numberTypeCode: 'long_code',
  description: 'Shared default',
  isDefault: true,
  tenants: [{ tenantId: 'tenant-parks', tenantName: 'Parks' }],
}
const twilioNumber: SmsNumber = {
  ...awsNumber,
  id: 'num-twilio',
  phoneNumber: '+15551230000',
  providerCode: 'twilio',
  description: null,
  isDefault: false,
  tenants: [],
}
const request = (overrides: Partial<SmsNumberRequest>): SmsNumberRequest => ({
  id: 'req-1',
  tenantId: 'tenant-roads',
  tenantName: 'Roads',
  statusCode: 'pending',
  requestedBy: 'Terry User',
  requestedAt: '2026-11-16T18:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  decisionReason: null,
  phoneNumber: null,
  usesDefaultNumber: false,
  releasedBy: null,
  releasedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  ...overrides,
})
const code = (value: string, description: string) => ({ code: value, description })

/** A requests page as the API returns it. */
const pageOf = (data: SmsNumberRequest[], count = data.length) => ({
  data,
  count,
  page: 1,
  limit: 15,
  totalPages: Math.ceil(count / 15),
})

/** The query the requests table last asked for. */
const lastRequestsQuery = () => vi.mocked(getSmsNumberRequests).mock.lastCall?.[0]

function setup({
  numbers = [awsNumber, twilioNumber],
  requests = [
    request({
      id: 'req-old',
      tenantName: 'Parks',
      statusCode: 'approved',
      requestedAt: '2026-11-17T18:00:00.000Z',
      decidedBy: 'Pat Admin',
      decidedAt: '2026-11-17T19:00:00.000Z',
      phoneNumber: '+15814360804',
    }),
    request({}),
  ],
  defaultNumberAssignable = false,
  requestCount,
}: {
  numbers?: SmsNumber[]
  requests?: SmsNumberRequest[]
  defaultNumberAssignable?: boolean
  /** The total across every page, when more than this page holds. */
  requestCount?: number
} = {}) {
  vi.mocked(getSmsNumbers).mockResolvedValue(numbers)
  vi.mocked(getSmsNumberRequests).mockResolvedValue(pageOf(requests, requestCount))
  vi.mocked(getSmsNumberCodes).mockResolvedValue({
    providers: [code('aws', 'AWS End User Messaging'), code('twilio', 'Twilio')],
    numberTypes: [code('long_code', 'Long code'), code('short_code', 'Short code')],
    requestStatuses: [],
    activeProvider: 'aws',
    defaultNumber: '+15550009999',
    defaultNumberAssignable,
  })
  return render(<AdminSmsNumbers />)
}

/** The Numbers table is on its own tab; Requests is shown first. */
async function openNumbersTab() {
  await userEvent.click(await screen.findByRole('radio', { name: 'Numbers' }))
}

async function chooseAction(menuLabel: string, action: string) {
  await userEvent.click(await screen.findByRole('button', { name: menuLabel }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

async function chooseOption(fieldLabel: RegExp, option: string) {
  await userEvent.click(screen.getByRole('button', { name: fieldLabel }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('AdminSmsNumbers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for pending requests by default, then shows the numbers on their own tab', async () => {
    setup()

    const requests = await screen.findByRole('table', { name: 'SMS number requests' })
    await within(requests).findByRole('row', { name: /Roads/ })
    expect(lastRequestsQuery()).toEqual({
      page: 1,
      limit: 15,
      search: undefined,
      filter: ['statusCode:in:pending'],
    })
    expect(within(requests).getByRole('row', { name: /Parks/ })).toBeInTheDocument()

    // Requests show first; the numbers are on their own tab.
    expect(screen.queryByRole('table', { name: 'SMS numbers' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Requests' })).toBeChecked()
    await openNumbersTab()
    const numbers = screen.getByRole('table', { name: 'SMS numbers' })
    expect(screen.queryByRole('table', { name: 'SMS number requests' })).not.toBeInTheDocument()
    const awsRow = within(numbers).getByRole('row', { name: /\+15814360804/ })
    expect(within(awsRow).getByText('Sending now')).toBeInTheDocument()
    expect(within(awsRow).getByText('Default')).toBeInTheDocument()
    expect(within(awsRow).getByText('Parks')).toBeInTheDocument()
    const twilioRow = within(numbers).getByRole('row', { name: /\+15551230000/ })
    expect(within(twilioRow).getByText('Not assigned')).toBeInTheDocument()
    expect(within(twilioRow).queryByText('Sending now')).not.toBeInTheDocument()
    expect(within(twilioRow).queryByText('Default')).not.toBeInTheDocument()
  })

  it('filters requests on other statuses from the Status column', async () => {
    setup()
    await screen.findByRole('table', { name: 'SMS number requests' })

    await userEvent.click(screen.getByRole('button', { name: 'Column options for Status' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Approved' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(lastRequestsQuery()).toMatchObject({
        page: 1,
        filter: ['statusCode:in:pending|approved'],
      }),
    )
  })

  it('searches requests by tenant name, suggesting tenants as you type', async () => {
    setup()
    await screen.findByRole('table', { name: 'SMS number requests' })

    await userEvent.type(screen.getByRole('combobox', { name: 'Search requests by tenant' }), 'Ro')
    await userEvent.click(await screen.findByRole('option', { name: 'Roads' }))

    await waitFor(() => expect(lastRequestsQuery()).toMatchObject({ page: 1, search: 'Roads' }))
  })

  it('pages through requests', async () => {
    setup({ requests: [request({})], requestCount: 40 })
    expect(await screen.findAllByText(/of 40 items/)).not.toHaveLength(0)
    // One request on arrival, not a second when the numbers finish loading.
    expect(getSmsNumberRequests).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => expect(lastRequestsQuery()).toMatchObject({ page: 2 }))
  })

  it('pages the numbers table', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...twilioNumber,
      id: `num-${i}`,
      phoneNumber: `+1555123${String(i).padStart(4, '0')}`,
    }))
    setup({ numbers: many })
    await openNumbersTab()

    const table = await screen.findByRole('table', { name: 'SMS numbers' })
    const numberRows = () => within(table).queryAllByRole('row', { name: /\+1555123/ })
    expect(numberRows()).toHaveLength(15)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(numberRows()).toHaveLength(5)
  })

  it('shows who decided a request and who released its number, and when', async () => {
    setup({
      requests: [
        request({
          statusCode: 'released',
          decidedBy: 'Pat Admin',
          decidedAt: '2026-11-17T19:00:00.000Z',
          phoneNumber: '+15814360804',
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

    const table = await screen.findByRole('table', { name: 'SMS number requests' })
    const released = await within(table).findByRole('row', { name: /Roads/ })
    expect(within(released).getByText(/Approved by Pat Admin/)).toBeInTheDocument()
    expect(within(released).getByText(/Released by Terry User/)).toBeInTheDocument()
    const rejected = within(table).getByRole('row', { name: /Parks/ })
    expect(within(rejected).getByText('No opt-out steps')).toBeInTheDocument()
    expect(within(rejected).getByText(/Rejected by Pat Admin/)).toBeInTheDocument()
    const cancelled = within(table).getByRole('row', { name: /Lands/ })
    expect(within(cancelled).getByText('Cancelled')).toBeInTheDocument()
    expect(within(cancelled).getByText(/Cancelled by Terry User/)).toBeInTheDocument()
    // Neither has anything left to do.
    expect(screen.queryByRole('button', { name: /request$/ })).toBeNull()
  })

  it("releases an approved request's number after confirming", async () => {
    vi.mocked(releaseSmsNumberRequest).mockResolvedValue(request({ statusCode: 'released' }))
    setup()

    await chooseAction("Actions for Parks's request", 'Release number')
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release number' }))

    await waitFor(() => expect(releaseSmsNumberRequest).toHaveBeenCalledWith('req-old'))
    expect(showSuccessToast).toHaveBeenCalledWith("Parks's number released")
  })

  it('approves a request by assigning the chosen number, then reloads', async () => {
    vi.mocked(approveSmsNumberRequest).mockResolvedValue(
      request({ statusCode: 'approved', phoneNumber: '+15551230000' }),
    )
    setup()

    await chooseAction("Actions for Roads's request", 'Approve and assign a number')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Select a number to assign.')).toBeInTheDocument()
    expect(approveSmsNumberRequest).not.toHaveBeenCalled()

    await chooseOption(/Number/, '+15551230000 (Twilio)')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(approveSmsNumberRequest).toHaveBeenCalledWith('req-1', 'num-twilio'))
    expect(showSuccessToast).toHaveBeenCalledWith('Approved: Roads now sends from +15551230000')
    await waitFor(() => expect(getSmsNumbers).toHaveBeenCalledTimes(2))
  })

  it('offers the default number when approving outside prod, and not otherwise', async () => {
    vi.mocked(approveSmsNumberRequest).mockResolvedValue(
      request({ statusCode: 'approved', usesDefaultNumber: true }),
    )
    const { unmount } = setup()
    await chooseAction("Actions for Roads's request", 'Approve and assign a number')
    await userEvent.click(screen.getByRole('button', { name: /Number/ }))
    expect(screen.queryByRole('option', { name: /Default number/ })).not.toBeInTheDocument()
    unmount()

    setup({ defaultNumberAssignable: true })
    await chooseAction("Actions for Roads's request", 'Approve and assign a number')
    await chooseOption(/Number/, 'Default number (+15550009999)')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(approveSmsNumberRequest).toHaveBeenCalledWith('req-1', null))
    expect(showSuccessToast).toHaveBeenCalledWith(
      'Approved: Roads now sends from the default number',
    )
  })

  it('rejects a request only with a reason', async () => {
    vi.mocked(rejectSmsNumberRequest).mockResolvedValue(request({ statusCode: 'rejected' }))
    setup()

    await chooseAction("Actions for Roads's request", 'Reject')
    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }))
    expect(await screen.findByText('Enter a reason for rejecting the request.')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'No opt-out steps')
    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }))

    await waitFor(() =>
      expect(rejectSmsNumberRequest).toHaveBeenCalledWith('req-1', 'No opt-out steps'),
    )
  })

  it('adds a number, checking its format first', async () => {
    vi.mocked(createSmsNumber).mockResolvedValue(twilioNumber)
    setup()
    await openNumbersTab()

    await userEvent.click(await screen.findByRole('button', { name: 'Add number' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Number/ }), '581-436-0804')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add number' }))
    expect(
      await within(dialog).findByText('Enter an E.164 number or a 5-6 digit short code.'),
    ).toBeInTheDocument()
    expect(createSmsNumber).not.toHaveBeenCalled()

    await userEvent.clear(within(dialog).getByRole('textbox', { name: /^Number/ }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Number/ }), '+15550001111')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add number' }))

    await waitFor(() =>
      expect(createSmsNumber).toHaveBeenCalledWith({
        phoneNumber: '+15550001111',
        providerCode: 'aws',
        numberTypeCode: 'long_code',
        description: null,
      }),
    )
  })

  it('assigns a number to a tenant that does not have it yet', async () => {
    vi.mocked(assignSmsNumber).mockResolvedValue()
    setup()
    await openNumbersTab()

    await chooseAction('Actions for +15814360804', 'Assign to a tenant')
    await userEvent.click(screen.getByRole('button', { name: /Tenant/ }))
    // Parks already has it.
    expect(screen.queryByRole('option', { name: 'Parks' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('option', { name: 'Roads' }))
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(assignSmsNumber).toHaveBeenCalledWith('tenant-roads', 'num-aws'))
  })

  it('unassigns a number from one tenant', async () => {
    vi.mocked(unassignSmsNumber).mockResolvedValue()
    setup()
    await openNumbersTab()

    await chooseAction('Actions for +15814360804', 'Unassign from Parks')
    await userEvent.click(screen.getByRole('button', { name: 'Unassign' }))

    await waitFor(() => expect(unassignSmsNumber).toHaveBeenCalledWith('tenant-parks', 'num-aws'))
    expect(showSuccessToast).toHaveBeenCalledWith('+15814360804 unassigned from Parks')
  })

  it("makes a number its provider's default, naming the one it replaces", async () => {
    vi.mocked(setDefaultSmsNumber).mockResolvedValue({ ...twilioNumber, isDefault: true })
    setup({
      numbers: [
        awsNumber,
        twilioNumber,
        { ...twilioNumber, id: 'num-t2', phoneNumber: '+15551230001', isDefault: true },
      ],
    })

    await openNumbersTab()
    await chooseAction('Actions for +15551230000', 'Make the default')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('through Twilio, instead of +15551230001')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Make the default' }))

    await waitFor(() => expect(setDefaultSmsNumber).toHaveBeenCalledWith('num-twilio'))
    expect(showSuccessToast).toHaveBeenCalledWith('+15551230000 is now the default')
  })

  it('stops using a number as the default', async () => {
    vi.mocked(clearDefaultSmsNumber).mockResolvedValue()
    setup()
    await openNumbersTab()

    await chooseAction('Actions for +15814360804', 'Stop using as the default')
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop using as the default' }))

    await waitFor(() => expect(clearDefaultSmsNumber).toHaveBeenCalledWith('num-aws'))
  })

  it('removes a number, and reports the backend refusing one still assigned', async () => {
    vi.mocked(deleteSmsNumber).mockRejectedValueOnce(
      new Error('Failed to remove the number: +15814360804 is assigned to 1 tenant(s)'),
    )
    setup()
    await openNumbersTab()

    await chooseAction('Actions for +15814360804', 'Remove')
    expect(screen.getByText(/Stop using it as the default first/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith(
        'Failed to remove the number: +15814360804 is assigned to 1 tenant(s)',
      ),
    )
  })

  it("summarises each provider's default above the numbers, including one not set", async () => {
    setup()
    await openNumbersTab()

    const summary = await screen.findByRole('region', { name: 'Default numbers' })
    // AWS is sending now and has a default; Twilio has numbers but no default.
    expect(within(summary).getByText('AWS End User Messaging')).toBeInTheDocument()
    expect(within(summary).getByText('Sending now')).toBeInTheDocument()
    expect(within(summary).getByText('+15814360804')).toBeInTheDocument()
    expect(within(summary).getByText('Not set')).toBeInTheDocument()
  })

  it('says what sends instead when the active provider has no default', async () => {
    setup({ numbers: [{ ...awsNumber, isDefault: false }] })
    await openNumbersTab()

    const summary = await screen.findByRole('region', { name: 'Default numbers' })
    expect(summary).toHaveTextContent(
      "Not set. Tenants without a number send from +15550009999, this environment's configured number.",
    )
  })

  it("changes a provider's default from the summary, or clears it", async () => {
    vi.mocked(setDefaultSmsNumber).mockResolvedValue({ ...twilioNumber, isDefault: true })
    vi.mocked(clearDefaultSmsNumber).mockResolvedValue()
    setup()
    await openNumbersTab()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Change the Twilio default number' }),
    )
    await chooseOption(/Default number/, '+15551230000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setDefaultSmsNumber).toHaveBeenCalledWith('num-twilio'))
    expect(showSuccessToast).toHaveBeenCalledWith('+15551230000 is now the Twilio default')

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Change the AWS End User Messaging default number',
      }),
    )
    await chooseOption(/Default number/, 'No default')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(clearDefaultSmsNumber).toHaveBeenCalledWith('num-aws'))
  })

  it('shows the no-data card when nothing is pending, offering all requests', async () => {
    setup({ requests: [] })

    expect(await screen.findByText('No pending requests.')).toBeInTheDocument()
    // The card replaces the search and table, as on the other list pages.
    expect(screen.queryByRole('table', { name: 'SMS number requests' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show all requests' }))
    await waitFor(() => expect(lastRequestsQuery()).toMatchObject({ filter: undefined }))
    expect(await screen.findByText('No SMS number requests yet.')).toBeInTheDocument()
  })

  it("keeps the table's own empty state for a search with no matches", async () => {
    setup()
    await screen.findByRole('table', { name: 'SMS number requests' })
    vi.mocked(getSmsNumberRequests).mockResolvedValue(pageOf([]))

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Search requests by tenant' }),
      'nobody{Enter}',
    )

    expect(
      await screen.findAllByText('No results found. Try a different search.'),
    ).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('shows the no-data card on the Numbers tab, with a way to add the first', async () => {
    setup({ numbers: [] })
    await openNumbersTab()

    expect(await screen.findByText('No SMS numbers yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'SMS numbers' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add number' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('shows a failed load as an alert', async () => {
    setup()
    vi.mocked(getSmsNumbers).mockRejectedValue(new Error('Failed to load SMS numbers: down'))
    render(<AdminSmsNumbers />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load SMS numbers: down')
  })
})
