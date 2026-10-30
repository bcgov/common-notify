import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent, waitFor, within } from '@/test-utils'
import FeatureFlagAdmin from './FeatureFlagAdmin'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { createFeatureFlag, updateFeatureFlag } from '@/redux/slices/featureFlags.slice'
import type * as FeatureFlagsModule from '@/redux/slices/featureFlags.slice'
import { getFeatureFlagHistory } from '@/api/featureFlags.api'
import type { FeatureFlagHistoryEntry } from '@/interfaces/feature-flag.interface'

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
vi.mock('@/api/featureFlags.api', () => ({ getFeatureFlagHistory: vi.fn() }))
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
  it('disables a flag once confirmed', async () => {
    setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Disable feature flag' }))
    const dialog = screen.getByRole('dialog', { name: 'Disable SMS notifications?' })
    expect(dialog).toHaveTextContent(
      'This turns SMS notifications off for all tenants, effective immediately.',
    )
    expect(updateFeatureFlag).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Disable' }))
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith('Feature flag updated successfully'),
    )
    expect(updateFeatureFlag).toHaveBeenCalledWith({ id: 'flag', enabled: false })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('enables a tenant override once confirmed, naming the tenant', async () => {
    setup([{ ...flag, enabled: false, tenantId: 'tenant' }])
    await userEvent.click(screen.getByRole('checkbox', { name: 'Enable feature flag' }))
    expect(screen.getByRole('dialog', { name: 'Enable SMS notifications?' })).toHaveTextContent(
      'This turns SMS notifications on for Test tenant, effective immediately.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }))
    await waitFor(() =>
      expect(updateFeatureFlag).toHaveBeenCalledWith({ id: 'flag', enabled: true }),
    )
  })
  it('warns that tenant overrides are unaffected by a global change', async () => {
    setup([flag, { ...flag, id: 'override', tenantId: 'tenant' }])
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Disable feature flag' })[0])
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Tenants with their own override for this flag keep it.',
    )
  })
  it('leaves the flag alone when the confirmation is cancelled', async () => {
    setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Disable feature flag' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateFeatureFlag).not.toHaveBeenCalled()
  })
  it('reports toggle errors', async () => {
    mocks.save.mockRejectedValue(new Error('Toggle failed'))
    setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Disable feature flag' }))
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith('Toggle failed'))
  })
  describe('history', () => {
    const entry = (id: string, enabled: boolean): FeatureFlagHistoryEntry => ({
      id,
      featureFlagId: 'flag',
      code: 'sms',
      tenantId: null,
      enabled,
      createdBy: 'guid@azureidir',
      createdByName: 'Falk, Barrett',
      createdAt: '2026-10-29T18:30:00Z',
    })
    const pageOf = (data: FeatureFlagHistoryEntry[], count = data.length, page = 1) => ({
      data,
      count,
      page,
      limit: 10,
      totalPages: Math.ceil(count / 10),
    })
    const openHistory = () =>
      userEvent.click(
        screen.getByRole('button', { name: 'View history for SMS notifications (All Tenants)' }),
      )

    it('lists who changed the flag and when, newest first', async () => {
      vi.mocked(getFeatureFlagHistory).mockResolvedValue(
        pageOf([
          {
            id: 'h2',
            featureFlagId: 'flag',
            code: 'sms',
            tenantId: null,
            enabled: false,
            createdBy: 'guid@azureidir',
            createdByName: 'Falk, Barrett',
            createdAt: '2026-10-29T18:30:00Z',
          },
          {
            id: 'h1',
            featureFlagId: 'flag',
            code: 'sms',
            tenantId: null,
            enabled: true,
            createdBy: 'migration',
            createdByName: null,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]),
      )
      setup()
      await openHistory()

      expect(screen.getByRole('dialog', { name: 'SMS notifications history' })).toHaveTextContent(
        'Applies to: All Tenants',
      )
      expect(getFeatureFlagHistory).toHaveBeenCalledWith('flag', 1, 10)
      const table = await screen.findByRole('table', { name: 'SMS notifications change history' })
      const rows = (await within(table).findAllByRole('row')).slice(1)
      expect(rows[0]).toHaveTextContent('Disabled')
      expect(rows[0]).toHaveTextContent('Falk, Barrett')
      expect(rows[1]).toHaveTextContent('Enabled')
      // No display name on record: falls back to the stored identifier.
      expect(rows[1]).toHaveTextContent('migration')
    })
    it('shows an empty state when nothing has been recorded', async () => {
      vi.mocked(getFeatureFlagHistory).mockResolvedValue(pageOf([]))
      setup()
      await openHistory()
      expect(await screen.findByText('No changes recorded yet.')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
    it('pages through a long history', async () => {
      vi.mocked(getFeatureFlagHistory)
        .mockResolvedValueOnce(pageOf([entry('h12', false)], 12))
        .mockResolvedValueOnce(pageOf([entry('h2', true)], 12, 2))
      setup()
      await openHistory()

      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))

      expect(getFeatureFlagHistory).toHaveBeenLastCalledWith('flag', 2, 10)
      const table = await screen.findByRole('table', { name: 'SMS notifications change history' })
      await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Enabled'))
      // Still a history with entries, not the empty card, while page 2 loads and after.
      expect(screen.queryByText('No changes recorded yet.')).not.toBeInTheDocument()
    })
    it('shows the error when history fails to load', async () => {
      vi.mocked(getFeatureFlagHistory).mockRejectedValue(new Error('History unavailable'))
      setup()
      await openHistory()
      expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })
  it('creates a tenant override', async () => {
    setup()
    await openCreate()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Tenants/ }), 'tenant')
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
