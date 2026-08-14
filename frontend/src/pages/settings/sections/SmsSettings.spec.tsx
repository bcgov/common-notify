import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SmsSettings from './SmsSettings'
import { showSuccessToast } from '@/redux/utils/toastUtils'
import { updateSmsSettings } from '@/redux/thunks/settings.thunks'
import { fetchApiKeyUsage } from '@/redux/thunks/apiKeyUsage.thunks'
import { CstarRole } from '@/enum/cstar-role.enum'

const dispatchMock = vi.fn()

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/settings.thunks', () => ({
  updateSmsSettings: vi.fn((payload) => ({ type: 'smsSettings/update', payload })),
}))

vi.mock('@/redux/thunks/apiKeyUsage.thunks', () => ({
  fetchApiKeyUsage: vi.fn(() => ({ type: 'apiKeyUsage/fetch' })),
}))

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

vi.mock('@bcgov/design-system-react-components', () => ({
  Button: ({ children, isDisabled, isIconButton: _isIconButton, ...props }: any) => (
    <button disabled={isDisabled} {...props}>
      {children}
    </button>
  ),
  Switch: ({ isSelected, isDisabled, onChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={isSelected}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.checked)}
      {...props}
    />
  ),
  Tooltip: ({ children }: any) => <span>{children}</span>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  SvgInfoIcon: () => null,
}))

const SAVED_SMS = {
  smsNotificationsEnabled: true,
  includeTenantNameInSms: true,
  internationalSmsEnabled: false,
}

function renderWithRoles(roles: CstarRole[] = [CstarRole.NOTIFY_OPERATIONS_ADMIN]) {
  state = {
    tenant: { selectedTenant: { id: 'tenant-1', name: 'Tenant One' } },
    apiKeyUsage: {
      isLoading: false,
      usage: { channels: [{ channel: 'SMS', dailyLimit: 1000, annualLimit: 50000 }] },
    },
    smsSettings: { ...SAVED_SMS, saving: false },
    user: { current: { cstarRoles: roles } },
  }
  return render(<SmsSettings />)
}

const saveButton = () => screen.getByRole('button', { name: 'Save SMS settings' })

describe('SmsSettings section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatchMock.mockImplementation((action) => ({
      unwrap: () => Promise.resolve(action.payload),
    }))
  })

  it('seeds the switches from the slice at mount', () => {
    renderWithRoles()

    expect(screen.getByLabelText('SMS notifications')).toBeChecked()
    expect(screen.getByLabelText('Include tenant name in SMS')).toBeChecked()
    expect(screen.getByLabelText('International SMS')).not.toBeChecked()
  })

  it('fetches the usage limits and renders them', () => {
    renderWithRoles()

    expect(fetchApiKeyUsage).toHaveBeenCalledTimes(1)
    expect(screen.getByText('1,000 SMS/day')).toBeInTheDocument()
    expect(screen.getByText('50,000 SMS/year')).toBeInTheDocument()
  })

  it('shows the selected tenant name in the prefix description', () => {
    renderWithRoles()

    expect(screen.getByText(/Start all SMS notifications with 'Tenant One'/)).toBeInTheDocument()
  })

  it('keeps Save disabled until a switch changes', () => {
    renderWithRoles()

    expect(saveButton()).toBeDisabled()

    fireEvent.click(screen.getByLabelText('International SMS'))

    expect(saveButton()).toBeEnabled()
  })

  it('keeps Save and the switches disabled for a user without the admin role', () => {
    renderWithRoles([CstarRole.NOTIFY_VIEWER])

    expect(saveButton()).toBeDisabled()
    expect(screen.getByLabelText('SMS notifications')).toBeDisabled()
    expect(screen.getByLabelText('International SMS')).toBeDisabled()
  })

  it('saves the current switch values and toasts on success', async () => {
    renderWithRoles()

    fireEvent.click(screen.getByLabelText('International SMS'))
    fireEvent.click(screen.getByLabelText('SMS notifications'))
    fireEvent.click(saveButton())

    await waitFor(() => {
      expect(updateSmsSettings).toHaveBeenCalledWith({
        smsNotificationsEnabled: false,
        includeTenantNameInSms: true,
        internationalSmsEnabled: true,
      })
      expect(showSuccessToast).toHaveBeenCalledWith('SMS settings updated successfully')
    })
  })

  it('reports Not set when a limit is missing', () => {
    renderWithRoles()
    state = { ...state, apiKeyUsage: { isLoading: false, usage: { channels: [] } } }
    render(<SmsSettings />)

    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0)
  })

  it('disables Save while saving to prevent duplicate submissions', () => {
    const { rerender } = renderWithRoles()

    fireEvent.click(screen.getByLabelText('International SMS'))
    expect(saveButton()).toBeEnabled()

    state = { ...state, smsSettings: { ...state.smsSettings, saving: true } }
    rerender(<SmsSettings />)

    const savingButton = screen.getByRole('button', { name: 'Saving…' })
    expect(savingButton).toBeDisabled()
    fireEvent.click(savingButton)
    expect(updateSmsSettings).not.toHaveBeenCalled()
  })
})
