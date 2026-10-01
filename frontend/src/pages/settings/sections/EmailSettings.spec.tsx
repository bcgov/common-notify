import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EmailSettings from './EmailSettings'
import EmailLogoMenu from '@/components/EmailLogoMenu'
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

vi.mock('@bcgov/design-system-react-components', async () => ({
  ...(await vi.importActual('@bcgov/design-system-react-components')),
  InlineAlert: ({ children }: any) => <div>{children}</div>,
  Link: ({ children, iconRight, ...props }: any) => (
    <a {...props}>
      {children}
      {iconRight}
    </a>
  ),
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
  // BCDS TextField hands onChange the value, not the event.
  TextField: ({
    onChange,
    isInvalid,
    errorMessage,
    isDisabled,
    iconLeft: _iconLeft,
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
  SvgCheckIcon: () => null,
  SvgChevronDownIcon: () => null,
  SvgChevronUpIcon: () => null,
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
    displayTitle: 'Agriculture and Food (AF)',
    imageUrl: 'https://gateway.example.test/logos/logo-1/image',
  },
  {
    id: 'logo-2',
    name: 'Alternate logo',
    displayTitle: 'Health (HLTH)',
    imageUrl: 'https://gateway.example.test/logos/logo-2/image',
  },
  {
    id: 'logo-3',
    name: 'Main BC Mark (horizontal)',
    isDefault: true,
    imageUrl: 'https://gateway.example.test/logos/logo-3/image',
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

  it('shows the flagged default when no tenant logo has been selected', async () => {
    render(
      <EmailLogoMenu
        logos={APPROVED_LOGOS.map((logo) => ({ isDefault: false, ...logo }))}
        value={null}
        onChange={vi.fn()}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Email logo/brand Main BC Mark (Default)' }),
    )
    expect(screen.getByRole('option', { name: 'Main BC Mark (Default)' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('option', { name: 'No logo' })).not.toBeInTheDocument()
  })

  it('defaults to logo only and saves an opt-in title that follows the selected logo', async () => {
    renderWithRoles()
    expect(screen.getByRole('radio', { name: 'Use logo only (default)' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Use logo and title' }))
    expect(screen.getByRole('group', { name: 'Email header preview' })).toHaveTextContent(
      'Agriculture and Food (AF)',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Email logo/brand Primary logo' }))
    await userEvent.click(screen.getByRole('option', { name: 'Alternate logo' }))
    expect(screen.getByRole('group', { name: 'Email header preview' })).toHaveTextContent(
      'Health (HLTH)',
    )
    await userEvent.click(saveButton())
    await waitFor(() =>
      expect(updateEmailSettings).toHaveBeenCalledWith(
        expect.objectContaining({ useCustomEmailHeader: true, emailLogoId: 'logo-2' }),
      ),
    )
  })

  it('renders the selected logo and API-provided thumbnails in the dropdown', async () => {
    renderWithRoles()

    const trigger = screen.getByRole('button', { name: 'Email logo/brand Primary logo' })
    expect(trigger.querySelector('img')).toHaveAttribute('src', APPROVED_LOGOS[0].imageUrl)

    await userEvent.click(trigger)

    const primaryOption = screen.getByRole('option', { name: 'Primary logo' })
    expect(primaryOption.querySelector('img')).toHaveAttribute('src', APPROVED_LOGOS[0].imageUrl)
    expect(screen.getByRole('option', { name: 'Alternate logo' })).toBeInTheDocument()
    const recommendedOption = screen.getByRole('option', { name: 'Main BC Mark (Default)' })
    expect(screen.getByRole('group', { name: 'Recommended' })).toContainElement(recommendedOption)
    expect(screen.getByRole('group', { name: 'Provincial Ministry Marks' })).toContainElement(
      primaryOption,
    )
    expect(screen.getByRole('group', { name: 'Provincial Ministry Marks' })).toContainElement(
      screen.getByRole('option', { name: 'Alternate logo' }),
    )
    expect(screen.queryByRole('option', { name: 'No logo' })).not.toBeInTheDocument()
  })

  it('saves a newly selected logo with the existing email settings payload', async () => {
    renderWithRoles()

    await userEvent.click(screen.getByRole('button', { name: 'Email logo/brand Primary logo' }))
    await userEvent.click(screen.getByRole('option', { name: 'Alternate logo' }))
    fireEvent.click(saveButton())

    await waitFor(() => {
      expect(updateEmailSettings).toHaveBeenCalledWith({
        emailLogoId: 'logo-2',
        useCustomEmailHeader: false,
        emailNotificationsEnabled: true,
        emailAttachmentsEnabled: true,
        replyToEmail: 'noreply',
      })
    })
  })

  it('allows selecting the system default logo', async () => {
    renderWithRoles()

    await userEvent.click(screen.getByRole('button', { name: 'Email logo/brand Primary logo' }))
    await userEvent.click(screen.getByRole('option', { name: 'Main BC Mark (Default)' }))
    fireEvent.click(saveButton())

    await waitFor(() => {
      expect(updateEmailSettings).toHaveBeenCalledWith(
        expect.objectContaining({ emailLogoId: APPROVED_LOGOS[2].id }),
      )
    })
  })

  it('filters logos and supports arrow-key selection and Escape', async () => {
    renderWithRoles()

    await userEvent.click(screen.getByRole('button', { name: 'Email logo/brand Primary logo' }))
    const search = screen.getByRole('combobox', { name: 'Search email logos' })
    await userEvent.type(search, 'Alternate')

    expect(screen.queryByRole('option', { name: 'Primary logo' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alternate logo' })).toBeInTheDocument()

    await userEvent.keyboard('{ArrowDown}{Enter}')

    const alternateTrigger = screen.getByRole('button', {
      name: 'Email logo/brand Alternate logo',
    })
    expect(alternateTrigger).toHaveFocus()
    expect(saveButton()).toBeEnabled()

    await userEvent.click(alternateTrigger)
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(alternateTrigger).toHaveFocus()
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
        useCustomEmailHeader: false,
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
