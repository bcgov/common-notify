import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent } from '@/test-utils'
import TenantSelectionModal from './TenantSelectionModal'
import type { Tenant } from '@/interfaces/CstarTenant'
import { selectTenant } from '@/redux/slices/tenant.slice'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  admin: false,
  logout: vi.fn(),
}))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mocks.state),
  useAppDispatch: () => mocks.dispatch,
}))
vi.mock('@/service/user-service', () => ({
  default: { hasRole: () => mocks.admin, doLogout: mocks.logout },
}))
const tenants = [
  { id: 'one', name: 'First tenant' },
  { id: 'two', name: 'Second tenant' },
] as Tenant[]
function setup(items = tenants, showTenantModal = true) {
  mocks.state = { tenant: { showTenantModal }, cstar: { tenants: items } }
  render(<TenantSelectionModal />)
}
describe('TenantSelectionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin = false
  })
  it('requires selection before continuing and fetches the selected roles', async () => {
    setup()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Select a tenant/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'Second tenant' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(selectTenant(tenants[1]))
    expect(mocks.dispatch).toHaveBeenCalledTimes(2)
  })
  it('offers setup for users with no tenants', async () => {
    setup([])
    expect(screen.getByText('Set up your tenant')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create tenant' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mocks.logout).toHaveBeenCalled()
  })
  it('allows administrators with no tenants to bypass selection', () => {
    mocks.admin = true
    setup([])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('does not show for a single tenant or a closed modal', () => {
    setup([tenants[0]])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('honors the closed state for multiple tenants', () => {
    setup(tenants, false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
