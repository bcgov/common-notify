import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SafelistSection from './SafelistSection'
import { addSafelistEntry, removeSafelistEntry } from '@/redux/thunks/safelist.thunks'

const dispatchMock = vi.fn()

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/safelist.thunks', () => ({
  fetchSafelist: vi.fn(() => ({ type: 'safelist/fetch' })),
  addSafelistEntry: vi.fn((payload) => ({ type: 'safelist/add', payload })),
  removeSafelistEntry: vi.fn((id) => ({ type: 'safelist/remove', payload: id })),
}))

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

vi.mock('@bcgov/design-system-react-components', () => ({
  Button: ({ children, isDisabled, onPress, ...props }: any) => (
    <button disabled={isDisabled} onClick={onPress} {...props}>
      {children}
    </button>
  ),
}))

function entry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'entry-1',
    tenantId: 'tenant-1',
    channelCode: 'EMAIL',
    recipient: 'qa.mailbox@gov.bc.ca',
    recipientNormalized: 'qa.mailbox@gov.bc.ca',
    label: 'QA mailbox',
    createdAt: '2026-08-13T00:00:00.000Z',
    createdBy: 'admin-guid',
    updatedAt: '2026-08-13T00:00:00.000Z',
    updatedBy: 'admin-guid',
    ...overrides,
  }
}

function setState(safelist: Partial<Record<string, unknown>> = {}) {
  state = {
    tenant: { selectedTenant: { id: 'tenant-1', name: 'Test Ministry' } },
    safelist: {
      entries: [],
      enforced: true,
      maxEntries: 50,
      loading: false,
      saving: false,
      error: undefined,
      ...safelist,
    },
  }
}

describe('SafelistSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatchMock.mockReset()
    dispatchMock.mockReturnValue({ unwrap: () => Promise.resolve(entry()) })
    setState()
  })

  it('warns that only safelisted recipients are sent to when enforcement is on', () => {
    render(<SafelistSection />)

    expect(screen.getByText(/only sends to safelisted recipients/i)).toBeInTheDocument()
  })

  it('says the safelist is not enforced in production', () => {
    setState({ enforced: false })

    render(<SafelistSection />)

    expect(screen.getByText(/does not enforce the safelist/i)).toBeInTheDocument()
  })

  it('spells out that an empty safelist blocks all sending when enforced', () => {
    render(<SafelistSection />)

    expect(screen.getByText(/cannot send any notifications/i)).toBeInTheDocument()
  })

  it('lists existing entries with their channel and label', () => {
    setState({
      entries: [
        entry(),
        entry({ id: 'entry-2', channelCode: 'SMS', recipient: '+12505550100', label: null }),
      ],
    })

    render(<SafelistSection />)

    const rows = screen.getAllByRole('row').slice(1) // drop the header row
    expect(rows[0]).toHaveTextContent('qa.mailbox@gov.bc.ca')
    expect(rows[0]).toHaveTextContent('Email')
    expect(rows[0]).toHaveTextContent('QA mailbox')
    expect(rows[1]).toHaveTextContent('+12505550100')
    expect(rows[1]).toHaveTextContent('SMS')
  })

  it('adds a trimmed entry for the selected channel', async () => {
    render(<SafelistSection />)

    fireEvent.change(screen.getByLabelText(/channel/i), { target: { value: 'SMS' } })
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: '  (250) 555-0100  ' },
    })
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: ' QA phone ' } })
    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => {
      expect(addSafelistEntry).toHaveBeenCalledWith({
        channelCode: 'SMS',
        recipient: '(250) 555-0100',
        label: 'QA phone',
      })
    })
  })

  it('does not submit an empty recipient', () => {
    render(<SafelistSection />)

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    expect(addSafelistEntry).not.toHaveBeenCalled()
  })

  it('blocks adding once the cap is reached and says why', () => {
    setState({ entries: [entry()], maxEntries: 1 })

    render(<SafelistSection />)

    expect(screen.getByText(/1 of 1 entries used/)).toBeInTheDocument()
    expect(screen.getByText(/remove an entry before adding another/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()
  })

  it('removes an entry', async () => {
    setState({ entries: [entry()] })

    render(<SafelistSection />)

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => {
      expect(removeSafelistEntry).toHaveBeenCalledWith('entry-1')
    })
  })

  it('surfaces a load or save error', () => {
    setState({ error: 'Safelist is full (50 entries).' })

    render(<SafelistSection />)

    expect(screen.getByText('Safelist is full (50 entries).')).toBeInTheDocument()
  })
})
