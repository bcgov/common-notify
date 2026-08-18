import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SafelistSection from './SafelistSection'
import { addSafelistEntry, removeSafelistEntry } from '@/redux/thunks/safelist.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import type { SafelistEntry } from '@/interfaces/safelist.interface'

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

// The form and table have their own specs; here we only care that this component wires them up.
vi.mock('@/components/safelist', () => ({
  SafelistForm: ({ onSubmit, isFull }: any) => (
    <button
      data-testid="add"
      data-full={String(Boolean(isFull))}
      onClick={() => onSubmit({ channelCode: 'EMAIL', recipient: 'qa@gov.bc.ca', label: null })}
    >
      add
    </button>
  ),
  SafelistTable: ({ entries, onRemove, emptyMessage }: any) => (
    <div>
      <span data-testid="entry-count">{entries.length}</span>
      <span data-testid="empty-message">{emptyMessage}</span>
      {entries.map((entry: SafelistEntry) => (
        <button key={entry.id} data-testid={`remove-${entry.id}`} onClick={() => onRemove(entry)}>
          remove
        </button>
      ))}
    </div>
  ),
}))

function entry(overrides: Partial<SafelistEntry> = {}): SafelistEntry {
  return {
    id: 'entry-1',
    tenantId: 'tenant-1',
    channelCode: 'EMAIL',
    recipient: 'qa.mailbox@gov.bc.ca',
    recipientNormalized: 'qa.mailbox@gov.bc.ca',
    label: 'QA mailbox',
    createdAt: '2026-08-17T00:00:00.000Z',
    createdBy: '2f1a0b7c-9d3e-4f5a-8b6c-1d2e3f4a5b6c',
    createdByName: 'Falk, Barrett CITZ:EX',
    updatedAt: '2026-08-17T00:00:00.000Z',
    updatedBy: 'admin-guid',
    ...overrides,
  }
}

function setState(safelist: Record<string, unknown> = {}) {
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

  it('hides the list and the form entirely when enforcement is off', () => {
    setState({ enforced: false, entries: [entry()], maxEntries: 50 })

    render(<SafelistSection />)

    expect(screen.queryByTestId('add')).not.toBeInTheDocument()
    expect(screen.queryByTestId('entry-count')).not.toBeInTheDocument()
    expect(screen.queryByText(/entries used/)).not.toBeInTheDocument()
  })

  it('does not promise the list applies elsewhere', () => {
    setState({ enforced: false })

    render(<SafelistSection />)

    expect(screen.queryByText(/applies in test environments/i)).not.toBeInTheDocument()
  })

  it('spells out that an empty safelist blocks all sending when enforced', () => {
    render(<SafelistSection />)

    expect(screen.getByTestId('empty-message')).toHaveTextContent(/cannot send any notifications/i)
  })

  it('passes the entries through to the table', () => {
    setState({ entries: [entry(), entry({ id: 'entry-2' })] })

    render(<SafelistSection />)

    expect(screen.getByTestId('entry-count')).toHaveTextContent('2')
  })

  it('dispatches the add and reports success back to the form', async () => {
    render(<SafelistSection />)

    fireEvent.click(screen.getByTestId('add'))

    await waitFor(() =>
      expect(addSafelistEntry).toHaveBeenCalledWith({
        channelCode: 'EMAIL',
        recipient: 'qa@gov.bc.ca',
        label: null,
      }),
    )
    expect(showSuccessToast).toHaveBeenCalledWith('Recipient added to the safelist')
  })

  it('surfaces an add failure as a toast without clearing the form', async () => {
    dispatchMock.mockReturnValue({ unwrap: () => Promise.reject('Already on the safelist') })

    render(<SafelistSection />)
    fireEvent.click(screen.getByTestId('add'))

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith('Already on the safelist'))
  })

  it('removes an entry and names it in the confirmation', async () => {
    setState({ entries: [entry()] })

    render(<SafelistSection />)
    fireEvent.click(screen.getByTestId('remove-entry-1'))

    await waitFor(() => expect(removeSafelistEntry).toHaveBeenCalledWith('entry-1'))
    expect(showSuccessToast).toHaveBeenCalledWith('qa.mailbox@gov.bc.ca removed from the safelist')
  })

  it('tells the form when the tenant is at its cap', () => {
    setState({ entries: [entry()], maxEntries: 1 })

    render(<SafelistSection />)

    expect(screen.getByTestId('add')).toHaveAttribute('data-full', 'true')
    expect(screen.getByText(/1 of 1 entries used/)).toBeInTheDocument()
  })

  it('surfaces a load error', () => {
    setState({ error: 'Failed to load the safelist' })

    render(<SafelistSection />)

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load the safelist')
  })
})
