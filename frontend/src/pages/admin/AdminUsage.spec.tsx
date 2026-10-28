import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor, fireEvent } from '@/test-utils'
import reducer from '@/redux/slices/apiKeyUsage.slice'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import AdminUsage from './AdminUsage'
import { updateTenantLimits } from '@/redux/thunks/apiKeyUsage.thunks'
import type * as UsageThunks from '@/redux/thunks/apiKeyUsage.thunks'

vi.mock('@/redux/thunks/apiKeyUsage.thunks', async (importOriginal) => {
  const actual = await importOriginal<typeof UsageThunks>()
  return { ...actual, updateTenantLimits: vi.fn(actual.updateTenantLimits) }
})

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  admin: true,
  save: vi.fn(),
}))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mocks.state),
  useAppDispatch: () => mocks.dispatch,
}))
vi.mock('@/service/user-service', () => ({ default: { hasRole: () => mocks.admin } }))
vi.mock('@/components/PageHeading', () => ({ default: () => <h1>Usage</h1> }))
vi.mock('@/components/NotAuthorized', () => ({ default: () => <div>Not authorized</div> }))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }))

const row = {
  tenantId: 'tenant',
  tenantName: 'Test Tenant',
  channel: 'SMS',
  dailyLimit: 100,
  annualLimit: 1000,
  warnThresholdPercent: 80,
  usedToday: 20,
  usedThisYear: 30,
  usedThisMinute: 0,
  rateLimitPerMinute: 10,
}
let usageState: ReturnType<typeof reducer>
function setup(overrides = {}, roles = ['NOTIFY_OPERATIONS_ADMIN']) {
  usageState = { ...reducer(undefined, { type: 'init' }), ...overrides }
  mocks.state = {
    apiKeyUsage: usageState,
    tenant: { selectedTenant: { id: 'tenant' } },
    user: { current: { cstarRoles: roles } },
  }
  return render(<AdminUsage />)
}

describe('AdminUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin = true
    mocks.save.mockResolvedValue(undefined)
    mocks.dispatch.mockReturnValue({ unwrap: () => mocks.save() })
  })
  it('shows the empty state', () => {
    setup()
    expect(screen.getAllByText('No tenant usage data found.')[0]).toBeInTheDocument()
  })
  it('shows loading instead of empty content', () => {
    setup({ adminLoading: true })
    expect(screen.queryByText('No tenant usage data found.')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Loading/)[0]).toBeInTheDocument()
  })
  it('shows failed loads', () => {
    setup({ adminError: 'Service unavailable' })
    expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable')
  })
  it('allows authorized users to edit and save', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Edit limits' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily maximum' }), {
      target: { value: '60' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled())
    expect(updateTenantLimits).toHaveBeenCalledWith({
      tenantId: 'tenant',
      channel: 'SMS',
      dailyLimit: 60,
      annualLimit: 1000,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('validates numeric input without saving', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Edit limits' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily maximum' }), {
      target: { value: '0' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(showErrorToast).toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each(['Save unavailable', new Error('failure')])('reports save errors: %s', async (error) => {
    mocks.save.mockRejectedValue(error)
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Edit limits' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith(
        typeof error === 'string' ? error : 'Failed to update limits',
      ),
    )
    expect(screen.getByRole('spinbutton', { name: 'Daily maximum' })).toBeInTheDocument()
  })
  it('denies users without the administrator role and does not fetch', () => {
    mocks.admin = false
    setup()
    expect(screen.getAllByText('Not authorized')[0]).toBeInTheDocument()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
