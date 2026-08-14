import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TenantSettings from './TenantSettings'
import { showSuccessToast } from '@/redux/utils/toastUtils'
import { updateTenantSettings } from '@/redux/thunks/settings.thunks'
import { CstarRole } from '@/enum/cstar-role.enum'

const dispatchMock = vi.fn()

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/settings.thunks', () => ({
  updateTenantSettings: vi.fn((payload) => ({ type: 'tenantSettings/update', payload })),
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
  // BCDS TextField hands onChange the value, not the event.
  TextField: ({
    onChange,
    isInvalid,
    errorMessage,
    isDisabled,
    iconRight: _iconRight,
    ...props
  }: any) => (
    <>
      <input
        aria-invalid={Boolean(isInvalid)}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
      {errorMessage && <span>{errorMessage}</span>}
    </>
  ),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  Tooltip: ({ children }: any) => <span>{children}</span>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  SvgInfoIcon: () => null,
  SvgUpRightFromSquareIcon: () => null,
}))

function renderWithRoles(roles: CstarRole[] = [CstarRole.NOTIFY_OPERATIONS_ADMIN]) {
  state = {
    tenantSettings: {
      alertEmail: 'saved@example.com',
      defaultSenderEmail: 'noreply',
      saving: false,
    },
    user: { current: { cstarRoles: roles } },
  }
  return render(<TenantSettings />)
}

const saveButton = () => screen.getByRole('button', { name: 'Save tenant settings' })

describe('TenantSettings section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatchMock.mockImplementation((action) => ({
      unwrap: () =>
        Promise.resolve({
          alertEmail: action.payload.alertEmail,
          defaultSenderEmail: action.payload.defaultSenderEmail,
        }),
    }))
  })

  it('seeds the inputs from the slice at mount', () => {
    renderWithRoles()

    expect(screen.getByLabelText('Alert email')).toHaveValue('saved@example.com')
    expect(screen.getByLabelText('Default sending email address')).toHaveValue('noreply')
  })

  it('keeps Save disabled while the loaded value is unchanged', () => {
    renderWithRoles()

    expect(saveButton()).toBeDisabled()
  })

  it('enables Save after a valid edit', () => {
    renderWithRoles()

    fireEvent.change(screen.getByLabelText('Alert email'), {
      target: { value: 'changed@example.com' },
    })

    expect(saveButton()).toBeEnabled()
  })

  it('keeps Save disabled for a user without the admin role', () => {
    renderWithRoles([CstarRole.NOTIFY_VIEWER])

    fireEvent.change(screen.getByLabelText('Alert email'), {
      target: { value: 'changed@example.com' },
    })

    expect(saveButton()).toBeDisabled()
    expect(screen.getByLabelText('Alert email')).toBeDisabled()
  })

  it('does not show an error during initial invalid typing', () => {
    renderWithRoles()

    fireEvent.change(screen.getByLabelText('Alert email'), { target: { value: 'invalid-email' } })

    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Alert email')).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows the inline error after leaving an invalid field', () => {
    renderWithRoles()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: 'invalid-email' } })
    fireEvent.blur(input)

    expect(screen.getByText('Enter a valid alert email address')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(saveButton()).toBeDisabled()
  })

  it('shows the error on submit without blur and sends no PATCH request', () => {
    renderWithRoles()

    fireEvent.change(screen.getByLabelText('Alert email'), { target: { value: 'invalid-email' } })
    fireEvent.submit(saveButton().closest('form')!)

    expect(screen.getByText('Enter a valid alert email address')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })

  it('clears a visible error immediately when the value becomes valid', () => {
    renderWithRoles()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: 'invalid-email' } })
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: 'valid@example.com' } })

    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(saveButton()).toBeEnabled()
  })

  it('treats blank input as a valid clear operation', () => {
    renderWithRoles()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('blocks submit and flags the field when the required sender is cleared', () => {
    renderWithRoles()

    fireEvent.change(screen.getByLabelText('Default sending email address'), {
      target: { value: '' },
    })
    fireEvent.submit(saveButton().closest('form')!)

    expect(screen.getByText('Enter a default sending email address')).toBeInTheDocument()
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })

  it('saves the normalized values and toasts on success', async () => {
    renderWithRoles()

    fireEvent.change(screen.getByLabelText('Alert email'), {
      target: { value: 'changed@example.com' },
    })
    fireEvent.click(saveButton())

    await waitFor(() => {
      expect(updateTenantSettings).toHaveBeenCalledWith({
        alertEmail: 'changed@example.com',
        defaultSenderEmail: 'noreply',
      })
      expect(showSuccessToast).toHaveBeenCalledWith('Tenant settings updated successfully')
    })
  })

  it('disables Save while saving to prevent duplicate submissions', () => {
    const { rerender } = renderWithRoles()

    // Dirty the form so Save would otherwise be enabled.
    fireEvent.change(screen.getByLabelText('Alert email'), {
      target: { value: 'changed@example.com' },
    })
    expect(saveButton()).toBeEnabled()

    state = { ...state, tenantSettings: { ...state.tenantSettings, saving: true } }
    rerender(<TenantSettings />)

    const savingButton = screen.getByRole('button', { name: 'Saving…' })
    expect(savingButton).toBeDisabled()
    fireEvent.click(savingButton)
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })
})
