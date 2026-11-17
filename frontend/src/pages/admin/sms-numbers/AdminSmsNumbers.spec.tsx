import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor, within } from '@/test-utils'
import AdminSmsNumbers from './AdminSmsNumbers'
import {
  assignSmsNumber,
  clearDefaultSmsNumber,
  createSmsNumber,
  deleteSmsNumber,
  getSmsNumberCodes,
  getSmsNumbers,
  setDefaultSmsNumber,
  unassignSmsNumber,
} from '@/api/smsNumbers.api'
import type { SmsNumber } from '@/api/smsNumbers.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

vi.mock('@/api/smsNumbers.api', () => ({
  getSmsNumbers: vi.fn(),
  getSmsNumberCodes: vi.fn(),
  createSmsNumber: vi.fn(),
  updateSmsNumber: vi.fn(),
  deleteSmsNumber: vi.fn(),
  assignSmsNumber: vi.fn(),
  unassignSmsNumber: vi.fn(),
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
const code = (value: string, description: string) => ({ code: value, description })

function setup({
  numbers = [awsNumber, twilioNumber],
}: {
  numbers?: SmsNumber[]
} = {}) {
  vi.mocked(getSmsNumbers).mockResolvedValue(numbers)
  vi.mocked(getSmsNumberCodes).mockResolvedValue({
    providers: [code('aws', 'AWS End User Messaging'), code('twilio', 'Twilio')],
    numberTypes: [code('long_code', 'Long code'), code('short_code', 'Short code')],
    activeProvider: 'aws',
    defaultNumber: '+15550009999',
    defaultNumberAssignable: false,
  })
  return render(<AdminSmsNumbers />)
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

  it('lists the numbers with their type, default and tenants', async () => {
    setup()

    const numbers = await screen.findByRole('table', { name: 'SMS numbers' })
    // Requests are decided on the Tenant Requests page, not here.
    expect(screen.queryByRole('radio', { name: 'Requests' })).not.toBeInTheDocument()
    const awsRow = within(numbers).getByRole('row', { name: /\+15814360804/ })
    expect(within(awsRow).getByRole('cell', { name: 'Long code' })).toBeInTheDocument()
    expect(within(awsRow).getByText('Default')).toBeInTheDocument()
    expect(within(awsRow).getByText('Parks')).toBeInTheDocument()
    const twilioRow = within(numbers).getByRole('row', { name: /\+15551230000/ })
    expect(within(twilioRow).getByText('Not assigned')).toBeInTheDocument()
    expect(within(twilioRow).queryByText('Default')).not.toBeInTheDocument()
  })

  it('pages the numbers table', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...twilioNumber,
      id: `num-${i}`,
      phoneNumber: `+1555123${String(i).padStart(4, '0')}`,
    }))
    setup({ numbers: many })

    const table = await screen.findByRole('table', { name: 'SMS numbers' })
    const numberRows = () => within(table).queryAllByRole('row', { name: /\+1555123/ })
    expect(numberRows()).toHaveLength(15)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(numberRows()).toHaveLength(5)
  })

  it('adds a number, checking its format first', async () => {
    vi.mocked(createSmsNumber).mockResolvedValue(twilioNumber)
    setup()

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

    const summary = await screen.findByRole('region', { name: 'Default numbers' })
    // AWS has a default; Twilio has numbers but no default.
    expect(within(summary).getByText('AWS End User Messaging')).toBeInTheDocument()
    expect(within(summary).getByText('+15814360804')).toBeInTheDocument()
    expect(within(summary).getByText('Not set')).toBeInTheDocument()
  })

  it('says what sends instead when the active provider has no default', async () => {
    setup({ numbers: [{ ...awsNumber, isDefault: false }] })

    const summary = await screen.findByRole('region', { name: 'Default numbers' })
    expect(summary).toHaveTextContent(
      "Not set. Tenants without a number send from +15550009999, this environment's configured number.",
    )
  })

  it("changes a provider's default from the summary, or clears it", async () => {
    vi.mocked(setDefaultSmsNumber).mockResolvedValue({ ...twilioNumber, isDefault: true })
    vi.mocked(clearDefaultSmsNumber).mockResolvedValue()
    setup()

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

  it('shows the no-data card until there is a number, with a way to add the first', async () => {
    setup({ numbers: [] })

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
