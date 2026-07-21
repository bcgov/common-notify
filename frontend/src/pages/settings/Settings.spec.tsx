import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { showSuccessToast } from '@/redux/utils/toastUtils'
import { updateTenantSettings } from '@/redux/thunks/tenantSettings.thunks'

const dispatchMock = vi.fn()
const fetchResults: Record<string, { alertEmail: string | null }> = {}

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/tenantSettings.thunks', () => ({
  fetchTenantSettings: vi.fn(() => ({ type: 'tenantSettings/fetch' })),
  updateTenantSettings: vi.fn((payload) => ({ type: 'tenantSettings/update', payload })),
}))

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

vi.mock('@bcgov/design-system-react-components', () => ({
  Button: ({ children, isDisabled, ...props }: any) => (
    <button disabled={isDisabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/PageHeading', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

function tenant(id: string, name: string) {
  return { id, name }
}

describe('Tenant Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state = {
      tenant: { selectedTenant: tenant('tenant-1', 'Tenant One') },
      tenantSettings: { alertEmail: null, loading: false, saving: false },
    }
    fetchResults['tenant-1'] = { alertEmail: 'saved@example.com' }
    fetchResults['tenant-2'] = { alertEmail: 'other@example.com' }

    dispatchMock.mockImplementation((action) => {
      if (action.type === 'tenantSettings/fetch') {
        const tenantId = state.tenant.selectedTenant.id
        return { unwrap: () => Promise.resolve(fetchResults[tenantId]) }
      }

      return {
        unwrap: () => Promise.resolve({ alertEmail: action.payload.alertEmail }),
      }
    })
  })

  async function renderLoadedSettings() {
    const result = render(<Settings />)
    await screen.findByDisplayValue('saved@example.com')
    return result
  }

  it('keeps Save disabled while the loaded value is unchanged', async () => {
    await renderLoadedSettings()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('enables Save after a valid edit', async () => {
    await renderLoadedSettings()

    fireEvent.change(screen.getByLabelText('Alert email'), {
      target: { value: 'changed@example.com' },
    })

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('does not show an error during initial invalid typing', async () => {
    await renderLoadedSettings()

    fireEvent.change(screen.getByLabelText('Alert email'), { target: { value: 'invalid-email' } })

    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Alert email')).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows the inline error after leaving an invalid field', async () => {
    await renderLoadedSettings()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: 'invalid-email' } })
    fireEvent.blur(input)

    expect(screen.getByText('Enter a valid alert email address')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows the error on submit without blur and sends no PATCH request', async () => {
    await renderLoadedSettings()

    fireEvent.change(screen.getByLabelText('Alert email'), { target: { value: 'invalid-email' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

    expect(screen.getByText('Enter a valid alert email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })

  it('clears a visible error immediately when the value becomes valid', async () => {
    await renderLoadedSettings()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: 'invalid-email' } })
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: 'valid@example.com' } })

    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('treats blank input as a valid clear operation', async () => {
    await renderLoadedSettings()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('makes the saved value the new clean baseline after a successful save', async () => {
    await renderLoadedSettings()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: 'invalid-email' } })
    fireEvent.blur(input)
    fireEvent.change(input, {
      target: { value: 'changed@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(showSuccessToast).toHaveBeenCalledWith('Tenant settings updated successfully')
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    fireEvent.change(input, { target: { value: 'invalid-again' } })
    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
  })

  it('resets to the newly loaded value when the selected tenant changes', async () => {
    const { rerender } = await renderLoadedSettings()

    const input = screen.getByLabelText('Alert email')
    fireEvent.change(input, { target: { value: 'invalid-email' } })
    fireEvent.blur(input)
    expect(screen.getByText('Enter a valid alert email address')).toBeInTheDocument()
    state = {
      ...state,
      tenant: { selectedTenant: tenant('tenant-2', 'Tenant Two') },
    }
    rerender(<Settings />)

    expect(await screen.findByDisplayValue('other@example.com')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('unsaved@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter a valid alert email address')).not.toBeInTheDocument()
    expect(screen.getByText('Tenant Two')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('disables Save while saving to prevent duplicate submissions', async () => {
    const { rerender } = await renderLoadedSettings()

    fireEvent.change(screen.getByLabelText('Alert email'), {
      target: { value: 'changed@example.com' },
    })
    state = {
      ...state,
      tenantSettings: { ...state.tenantSettings, saving: true },
    }
    rerender(<Settings />)

    const saveButton = screen.getByRole('button', { name: 'Saving…' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })
})
