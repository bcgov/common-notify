import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import EmailSettings from './EmailSettings'
import { showSuccessToast } from '@/redux/utils/toastUtils'
import { fetchApprovedEmailLogos, updateEmailSettings } from '@/redux/thunks/settings.thunks'
import { fetchApiKeyUsage } from '@/redux/thunks/apiKeyUsage.thunks'
import { CstarRole } from '@/enum/cstar-role.enum'

const dispatchMock = vi.fn()

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/settings.thunks', () => ({
  fetchApprovedEmailLogos: vi.fn(() => ({ type: 'emailSettings/fetchApprovedLogos' })),
  updateEmailSettings: vi.fn((payload) => ({ type: 'emailSettings/update', payload })),
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
  RadioGroup: ({ children, description, isDisabled, label, onChange, value }: any) => (
    <fieldset
      data-value={value}
      disabled={isDisabled}
      onChange={(event) => {
        const target = event.target as unknown as HTMLInputElement
        if (target.type === 'radio') onChange(target.value)
      }}
    >
      <legend>{label}</legend>
      {description && <span>{description}</span>}
      {children}
    </fieldset>
  ),
  Radio: ({ children, value }: { children: ReactNode; value: string }) => (
    <label>
      <input name="email-logo" type="radio" value={value} />
      {children}
    </label>
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
  Tooltip: ({ children }: any) => <span>{children}</span>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  SvgInfoIcon: () => null,
}))

const SAVED_EMAIL = {
  emailLogoId: 'logo-1',
  emailNotificationsEnabled: true,
  replyToEmail: 'noreply',
  emailAttachmentsEnabled: true,
}

const APPROVED_LOGOS = [
  {
    id: 'logo-1',
    name: 'Primary logo',
    imageUrl: 'https://gateway.example.test/logos/logo-1/image',
  },
  {
    id: 'logo-2',
    name: 'Alternate logo',
    imageUrl: 'https://gateway.example.test/logos/logo-2/image',
  },
]

function renderWithRoles(roles: CstarRole[] = [CstarRole.NOTIFY_OPERATIONS_ADMIN]) {
  state = {
    apiKeyUsage: {
      isLoading: false,
      usage: { channels: [{ channel: 'EMAIL', dailyLimit: 500, annualLimit: 1000500 }] },
    },
    emailSettings: {
      ...SAVED_EMAIL,
      approvedLogos: APPROVED_LOGOS,
      approvedLogosLoading: false,
      saving: false,
    },
    user: { current: { cstarRoles: roles } },
  }
  return render(<EmailSettings />)
}

const saveButton = () => screen.getByRole('button', { name: 'Save email settings' })

describe('EmailSettings section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatchMock.mockImplementation((action) => ({
      unwrap: () => Promise.resolve(action.payload),
    }))
  })

  it('seeds the switches and reply to input from the slice at mount', () => {
    renderWithRoles()

    expect(screen.getByLabelText('Email notifications')).toBeChecked()
    expect(screen.getByLabelText('Allow email attachments')).toBeChecked()
    expect(screen.getByLabelText('Reply to address')).toHaveValue('noreply')
  })

  it('shows the placeholder text', () => {
    renderWithRoles()

    expect(screen.getByPlaceholderText('Enter a reply to email address')).toBeInTheDocument()
  })

  it('fetches the usage limits and renders them', () => {
    renderWithRoles()

    expect(fetchApiKeyUsage).toHaveBeenCalledTimes(1)
    expect(fetchApprovedEmailLogos).toHaveBeenCalledTimes(1)
    expect(screen.getByText('500 emails/day')).toBeInTheDocument()
    expect(screen.getByText('1,000,500 emails/year')).toBeInTheDocument()
  })

  it('renders approved logo thumbnails using the API-provided public image URLs', () => {
    renderWithRoles()

    expect(screen.getByRole('group', { name: 'Email logo' })).toHaveAttribute(
      'data-value',
      'logo-1',
    )
    const primaryImage = screen.getByText('Primary logo').closest('label')?.querySelector('img')
    expect(primaryImage).toHaveAttribute('src', APPROVED_LOGOS[0].imageUrl)
    expect(screen.getByText('Primary logo')).toBeInTheDocument()
    expect(screen.getByText('Alternate logo')).toBeInTheDocument()
  })

  it('saves a newly selected logo with the existing email settings payload', async () => {
    renderWithRoles()

    fireEvent.click(screen.getByRole('radio', { name: 'Alternate logo' }))
    fireEvent.click(saveButton())

    await waitFor(() => {
      expect(updateEmailSettings).toHaveBeenCalledWith({
        emailLogoId: 'logo-2',
        emailNotificationsEnabled: true,
        emailAttachmentsEnabled: true,
        replyToEmail: 'noreply',
      })
    })
  })

  it('allows clearing the selected logo', async () => {
    renderWithRoles()

    fireEvent.click(screen.getByRole('radio', { name: 'No logo' }))
    fireEvent.click(saveButton())

    await waitFor(() => {
      expect(updateEmailSettings).toHaveBeenCalledWith(
        expect.objectContaining({ emailLogoId: null }),
      )
    })
  })

  it('keeps Save disabled until a value changes', () => {
    renderWithRoles()

    expect(saveButton()).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Allow email attachments'))

    expect(saveButton()).toBeEnabled()
  })

  it('keeps Save and the fields disabled for a user without the admin role', () => {
    renderWithRoles([CstarRole.NOTIFY_VIEWER])

    expect(saveButton()).toBeDisabled()
    expect(screen.getByLabelText('Email notifications')).toBeDisabled()
    expect(screen.getByLabelText('Reply to address')).toBeDisabled()
  })

  it('does not show an error during initial invalid typing', () => {
    renderWithRoles()

    fireEvent.change(screen.getByLabelText('Reply to address'), {
      target: { value: 'invalid address' },
    })

    expect(screen.queryByText('Enter a valid reply to email address')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Reply to address')).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows the inline error after leaving an invalid reply to field', () => {
    renderWithRoles()

    const input = screen.getByLabelText('Reply to address')
    fireEvent.change(input, { target: { value: 'invalid address' } })
    fireEvent.blur(input)

    expect(screen.getByText('Enter a valid reply to email address')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(saveButton()).toBeDisabled()
  })

  it('treats blank reply to input as a valid clear operation', () => {
    renderWithRoles()

    const input = screen.getByLabelText('Reply to address')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(screen.queryByText('Enter a valid reply to email address')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('saves the current values and toasts on success', async () => {
    renderWithRoles()

    fireEvent.click(screen.getByLabelText('Email notifications'))
    fireEvent.change(screen.getByLabelText('Reply to address'), {
      target: { value: 'support' },
    })
    fireEvent.click(saveButton())

    await waitFor(() => {
      expect(updateEmailSettings).toHaveBeenCalledWith({
        emailLogoId: 'logo-1',
        emailNotificationsEnabled: false,
        emailAttachmentsEnabled: true,
        replyToEmail: 'support',
      })
      expect(showSuccessToast).toHaveBeenCalledWith('Email settings updated successfully')
    })
  })

  it('reports Not set when a limit is missing', () => {
    renderWithRoles()
    state = { ...state, apiKeyUsage: { isLoading: false, usage: { channels: [] } } }
    render(<EmailSettings />)

    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0)
  })

  it('disables Save while saving to prevent duplicate submissions', () => {
    const { rerender } = renderWithRoles()

    fireEvent.click(screen.getByLabelText('Allow email attachments'))
    expect(saveButton()).toBeEnabled()

    state = { ...state, emailSettings: { ...state.emailSettings, saving: true } }
    rerender(<EmailSettings />)

    const savingButton = screen.getByRole('button', { name: 'Saving…' })
    expect(savingButton).toBeDisabled()
    fireEvent.click(savingButton)
    expect(updateEmailSettings).not.toHaveBeenCalled()
  })
})
