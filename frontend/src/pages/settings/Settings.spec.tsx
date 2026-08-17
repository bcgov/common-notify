import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { fetchSettings } from '@/redux/thunks/settings.thunks'

const dispatchMock = vi.fn()
const tenantMounts = vi.fn()

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/settings.thunks', () => ({
  fetchSettings: vi.fn(() => ({ type: 'settings/fetch' })),
}))

// The sections are covered by their own specs; this file only exercises the page's
// single-fetch + loading-gate responsibility.
vi.mock('./sections/TenantSettings', () => ({
  default: () => {
    tenantMounts()
    return <div>tenant section</div>
  },
}))
vi.mock('./sections/EmailSettings', () => ({ default: () => <div>email section</div> }))
vi.mock('./sections/SmsSettings', () => ({ default: () => <div>sms section</div> }))

vi.mock('@/components/Breadcrumb', () => ({ default: () => null }))

vi.mock('@bcgov/design-system-react-components', () => ({
  ToggleButtonGroup: ({ children, onSelectionChange }: any) => (
    <div
      data-testid="tabs"
      onClick={(event: any) => onSelectionChange(new Set([event.target.dataset.id]))}
    >
      {children}
    </div>
  ),
  ToggleButton: ({ id, children }: any) => (
    <button type="button" data-id={id}>
      {children}
    </button>
  ),
}))

function tenant(id: string, name: string) {
  return { id, name }
}

/** A promise whose settlement this test controls, so the pending frame is assertable. */
function deferred() {
  let resolve!: (value?: unknown) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise((res, rej) => {
    resolve = res as typeof resolve
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state = { tenant: { selectedTenant: tenant('tenant-1', 'Tenant One') } }
    dispatchMock.mockImplementation(() => ({ unwrap: () => Promise.resolve(null) }))
  })

  it('fetches settings once for the selected tenant', async () => {
    render(<Settings />)

    await screen.findByText('tenant section')
    expect(fetchSettings).toHaveBeenCalledTimes(1)
  })

  it('shows the loading placeholder and no section while the fetch is in flight', async () => {
    const { promise, resolve } = deferred()
    dispatchMock.mockImplementation(() => ({ unwrap: () => promise }))

    render(<Settings />)

    expect(screen.getByText('Loading settings...')).toBeInTheDocument()
    expect(screen.queryByText('tenant section')).not.toBeInTheDocument()

    resolve()
    expect(await screen.findByText('tenant section')).toBeInTheDocument()
  })

  it('renders the load error instead of the section when the fetch rejects', async () => {
    dispatchMock.mockImplementation(() => ({
      unwrap: () => Promise.reject('You are not authorized to view settings'),
    }))

    render(<Settings />)

    expect(await screen.findByText('You are not authorized to view settings')).toBeInTheDocument()
    expect(screen.queryByText('tenant section')).not.toBeInTheDocument()
  })

  it('does not fetch when no tenant is selected', () => {
    state = { tenant: { selectedTenant: null } }

    render(<Settings />)

    expect(fetchSettings).not.toHaveBeenCalled()
    expect(screen.getByText('Loading settings...')).toBeInTheDocument()
  })

  it('switches sections without re-fetching', async () => {
    render(<Settings />)
    await screen.findByText('tenant section')

    fireEvent.click(screen.getByText('SMS Settings'))

    expect(await screen.findByText('sms section')).toBeInTheDocument()
    expect(screen.queryByText('tenant section')).not.toBeInTheDocument()
    expect(fetchSettings).toHaveBeenCalledTimes(1)
  })

  it('re-fetches and remounts the section when the selected tenant changes', async () => {
    const { rerender } = render(<Settings />)
    await screen.findByText('tenant section')
    expect(tenantMounts).toHaveBeenCalledTimes(1)

    state = { tenant: { selectedTenant: tenant('tenant-2', 'Tenant Two') } }
    rerender(<Settings />)

    // The gate closes on the render the tenant changes, before the effect even runs.
    expect(screen.getByText('Loading settings...')).toBeInTheDocument()
    expect(screen.queryByText('tenant section')).not.toBeInTheDocument()

    await screen.findByText('tenant section')
    await waitFor(() => expect(fetchSettings).toHaveBeenCalledTimes(2))
    // Remounted rather than reused, so it reseeds from the newly loaded slice values.
    expect(tenantMounts).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Tenant Two')).toBeInTheDocument()
  })
})
