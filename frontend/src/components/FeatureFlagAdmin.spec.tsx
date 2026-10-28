import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent, waitFor } from '@/test-utils'
import FeatureFlagAdmin from './FeatureFlagAdmin'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { createFeatureFlag, updateFeatureFlag } from '@/redux/slices/featureFlags.slice'
import type * as FeatureFlagsModule from '@/redux/slices/featureFlags.slice'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  save: vi.fn(),
}))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mocks.state),
  useAppDispatch: () => mocks.dispatch,
}))
vi.mock('@/components/PageHeading', () => ({ default: () => <h1>Feature Flag Administration</h1> }))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }))
vi.mock('@/redux/slices/featureFlags.slice', async (importOriginal) => {
  const actual = await importOriginal<typeof FeatureFlagsModule>()
  return {
    ...actual,
    createFeatureFlag: vi.fn(actual.createFeatureFlag),
    updateFeatureFlag: vi.fn(actual.updateFeatureFlag),
  }
})

const flag = {
  id: 'flag',
  code: 'sms',
  enabled: true,
  tenantId: null,
  createdAt: '2026-01-01',
  flagCode: { code: 'sms', displayName: 'SMS notifications' },
}
function setup(flagsList = [flag], loading = false) {
  mocks.state = {
    featureFlags: { flagsList, loading },
    adminTenants: { items: [{ id: 'tenant', name: 'Test tenant' }] },
  }
  render(<FeatureFlagAdmin />)
}
async function openCreate() {
  await userEvent.click(screen.getByRole('button', { name: 'Create New Feature Flag' }))
  await userEvent.selectOptions(screen.getByLabelText(/Feature Code/), 'sms')
}
describe('FeatureFlagAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.save.mockResolvedValue(undefined)
    mocks.dispatch.mockReturnValue({ unwrap: () => mocks.save() })
  })
  it('shows empty flags', () => {
    setup([])
    expect(screen.getAllByText('No feature flags found')[0]).toBeInTheDocument()
  })
  it('shows loading', () => {
    setup([], true)
    expect(screen.getAllByText(/Loading/)[0]).toBeInTheDocument()
  })
  it('toggles enabled flags', async () => {
    setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Disable feature flag' }))
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith('Feature flag updated successfully'),
    )
    expect(updateFeatureFlag).toHaveBeenCalledWith({ id: 'flag', enabled: false })
  })
  it('reports toggle errors', async () => {
    mocks.save.mockRejectedValue(new Error('Toggle failed'))
    setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Disable feature flag' }))
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith('Toggle failed'))
  })
  it('creates a tenant override', async () => {
    setup()
    await openCreate()
    await userEvent.selectOptions(screen.getByLabelText(/Tenants/), 'tenant')
    await userEvent.click(screen.getByLabelText('Enable this flag'))
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith('Feature flag created successfully'),
    )
    expect(mocks.dispatch).toHaveBeenCalled()
    expect(createFeatureFlag).toHaveBeenCalledWith({
      code: 'sms',
      enabled: false,
      tenantId: 'tenant',
    })
  })
  it.each(['already exists', new Error('Unavailable'), {}])(
    'reports create failures: %s',
    async (error) => {
      mocks.save.mockRejectedValue(error)
      setup()
      await openCreate()
      await userEvent.click(screen.getByRole('button', { name: 'Create' }))
      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith(
          typeof error === 'string'
            ? 'This feature flag already exists globally. Please choose a different flag or tenant.'
            : error instanceof Error
              ? error.message
              : 'Failed to create feature flag',
        ),
      )
    },
  )
})
