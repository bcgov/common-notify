import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApiKeyField from './ApiKeyField'
import { CstarRole } from '@/enum/cstar-role.enum'
import {
  fetchApiKeys,
  issueApiKey,
  regenerateApiKey,
  updateApiKeyNotes,
} from '@/redux/thunks/apiKeys.thunks'
import { showErrorToast } from '@/redux/utils/toastUtils'

const dispatchMock = vi.fn()

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/apiKeys.thunks', () => ({
  fetchApiKeys: vi.fn(() => ({ type: 'apiKeys/fetch' })),
  issueApiKey: vi.fn((notes) => ({ type: 'apiKeys/issue', payload: notes })),
  regenerateApiKey: vi.fn((clientId) => ({ type: 'apiKeys/regenerate', payload: clientId })),
  updateApiKeyNotes: vi.fn((payload) => ({ type: 'apiKeys/updateNotes', payload })),
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
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  Tooltip: ({ children }: any) => <span>{children}</span>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  SvgInfoIcon: () => null,
  SvgUpRightFromSquareIcon: () => null,
  SvgCheckCircleIcon: () => null,
  SvgExclamationIcon: () => null,
}))

const EXISTING_KEY = {
  id: 'binding-uuid',
  clientId: 'AED1708-PizzaPlanet',
  notes: 'OpenShift secret',
  issuedVia: 'self-service' as const,
  currentKeyCreatedAt: '2026-08-07T19:14:39.000Z',
  activated: true,
  manageable: true,
  createdAt: '2026-08-07T19:14:39.000Z',
}

/** A key bound through the old Postman flow: no clientId, so Notify cannot rotate it. */
const LEGACY_KEY = {
  id: 'legacy-uuid',
  clientId: undefined,
  notes: null,
  issuedVia: 'bind' as const,
  currentKeyCreatedAt: '2026-01-04T10:00:00.000Z',
  activated: true,
  manageable: false,
  createdAt: '2026-01-04T10:00:00.000Z',
}

function renderField(
  options: {
    keys?: any[]
    saving?: boolean
    loading?: boolean
    error?: string
    roles?: CstarRole[]
  } = {},
) {
  const {
    keys = [],
    saving = false,
    loading = false,
    error,
    roles = [CstarRole.NOTIFY_OPERATIONS_ADMIN],
  } = options

  state = {
    apiKeys: { keys, saving, loading, error },
    user: { current: { cstarRoles: roles } },
  }

  return render(<ApiKeyField />)
}

/** Resolve a dispatched thunk with the given value, the way unwrap() would. */
const resolvesWith = (value: unknown) => ({ unwrap: () => Promise.resolve(value) })

describe('ApiKeyField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatchMock.mockReturnValue(resolvesWith(undefined))
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('loads the tenant keys on mount', () => {
    renderField()

    expect(fetchApiKeys).toHaveBeenCalled()
  })

  describe('when the tenant has no key', () => {
    it('offers to generate one', () => {
      renderField()

      expect(screen.getByRole('button', { name: 'Generate API Key' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Regenerate API Key' })).not.toBeInTheDocument()
    })

    it('shows the value once, with the warning that it will not be shown again', async () => {
      dispatchMock.mockReturnValue(
        resolvesWith({ apiKey: 'the-only-copy', clientId: 'AED1708-PizzaPlanet' }),
      )
      renderField()

      fireEvent.click(screen.getByRole('button', { name: 'Generate API Key' }))

      // Notes are captured in the dialog afterwards, so nothing is sent up front.
      expect(issueApiKey).toHaveBeenCalledWith(undefined)
      expect(await screen.findByText('the-only-copy')).toBeInTheDocument()
      expect(screen.getByText('This key is only shown once')).toBeInTheDocument()
    })

    it('reports a failure to generate instead of opening an empty dialog', async () => {
      dispatchMock.mockReturnValue({ unwrap: () => Promise.reject('The API gateway is down') })
      renderField()

      fireEvent.click(screen.getByRole('button', { name: 'Generate API Key' }))

      await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith('The API gateway is down'))
      expect(screen.queryByText('This key is only shown once')).not.toBeInTheDocument()
    })

    it('does not let a non-admin generate a key', () => {
      renderField({ roles: [CstarRole.NOTIFY_VIEWER] })

      expect(screen.getByRole('button', { name: 'Generate API Key' })).toBeDisabled()
    })
  })

  describe('when the tenant already has a key', () => {
    it('shows the label, notes and when the current value was created', () => {
      renderField({ keys: [EXISTING_KEY] })

      expect(screen.getByText('AED1708-PizzaPlanet')).toBeInTheDocument()
      expect(screen.getByText('OpenShift secret')).toBeInTheDocument()
      expect(screen.getByText(/^Created on /)).toBeInTheDocument()
    })

    it('never renders the key value itself', () => {
      renderField({ keys: [EXISTING_KEY] })

      expect(screen.queryByText(/only shown once/)).not.toBeInTheDocument()
    })

    it('offers regenerate rather than generate', () => {
      renderField({ keys: [EXISTING_KEY] })

      expect(screen.getByRole('button', { name: 'Regenerate API Key' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Generate API Key' })).not.toBeInTheDocument()
    })

    it('warns that existing integrations will break before regenerating', () => {
      renderField({ keys: [EXISTING_KEY] })

      fireEvent.click(screen.getByRole('button', { name: 'Regenerate API Key' }))

      expect(screen.getByText('Regenerate API Key?')).toBeInTheDocument()
      expect(screen.getByText(/immediately invalidate the existing key/)).toBeInTheDocument()
      // Nothing is sent until the confirmation is accepted.
      expect(regenerateApiKey).not.toHaveBeenCalled()
    })

    it('regenerates only after confirmation, then shows the new value', async () => {
      dispatchMock.mockReturnValue(resolvesWith({ apiKey: 'rotated-value' }))
      renderField({ keys: [EXISTING_KEY] })

      fireEvent.click(screen.getByRole('button', { name: 'Regenerate API Key' }))
      fireEvent.click(screen.getByRole('button', { name: 'Generate new key' }))

      await waitFor(() => expect(regenerateApiKey).toHaveBeenCalledWith('AED1708-PizzaPlanet'))
      expect(await screen.findByText('rotated-value')).toBeInTheDocument()
      expect(screen.getByText('New API Key')).toBeInTheDocument()
    })

    it('does not let a non-admin regenerate', () => {
      renderField({ keys: [EXISTING_KEY], roles: [CstarRole.NOTIFY_VIEWER] })

      expect(screen.getByRole('button', { name: 'Regenerate API Key' })).toBeDisabled()
    })
  })

  describe('the reveal dialog', () => {
    async function openReveal(keys: any[] = []) {
      dispatchMock.mockReturnValue(
        resolvesWith({ apiKey: 'the-only-copy', clientId: 'AED1708-PizzaPlanet' }),
      )
      renderField({ keys })
      fireEvent.click(
        screen.getByRole('button', {
          name: keys.length ? 'Regenerate API Key' : 'Generate API Key',
        }),
      )
      if (keys.length) {
        fireEvent.click(screen.getByRole('button', { name: 'Generate new key' }))
      }
      await screen.findByText('the-only-copy')
    }

    it('copies the value to the clipboard and confirms it', async () => {
      await openReveal()

      fireEvent.click(screen.getByRole('button', { name: 'Copy API Key' }))

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('the-only-copy')
      expect(await screen.findByText('API Key copied')).toBeInTheDocument()
    })

    it('does not claim success when the clipboard is unavailable', async () => {
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
      })
      await openReveal()

      fireEvent.click(screen.getByRole('button', { name: 'Copy API Key' }))

      await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
      expect(screen.queryByText('API Key copied')).not.toBeInTheDocument()
      // The value stays on screen so it can still be selected by hand.
      expect(screen.getByText('the-only-copy')).toBeInTheDocument()
    })

    it('saves the note on Done', async () => {
      await openReveal()

      fireEvent.change(screen.getByLabelText('API key notes'), {
        target: { value: '  Vault path secret/notify  ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      await waitFor(() =>
        expect(updateApiKeyNotes).toHaveBeenCalledWith({
          clientId: 'AED1708-PizzaPlanet',
          notes: 'Vault path secret/notify',
        }),
      )
    })

    it('skips the save when the note was not touched', async () => {
      await openReveal([EXISTING_KEY])

      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      await waitFor(() => expect(screen.queryByText('the-only-copy')).not.toBeInTheDocument())
      expect(updateApiKeyNotes).not.toHaveBeenCalled()
    })

    it('carries the existing note into a regeneration so it is not silently dropped', async () => {
      await openReveal([EXISTING_KEY])

      expect(screen.getByLabelText('API key notes')).toHaveValue('OpenShift secret')
    })

    it('closes even when saving the note fails, since the key already exists', async () => {
      await openReveal([EXISTING_KEY])
      dispatchMock.mockReturnValue({ unwrap: () => Promise.reject('Save failed') })

      fireEvent.change(screen.getByLabelText('API key notes'), { target: { value: 'new note' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith('Save failed'))
      expect(screen.queryByText('the-only-copy')).not.toBeInTheDocument()
    })
  })

  describe('when the tenant only has a key bound through the old Postman flow', () => {
    it('offers Generate rather than a Regenerate button it cannot honour', () => {
      renderField({ keys: [LEGACY_KEY] })

      expect(screen.getByRole('button', { name: 'Generate API Key' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Regenerate API Key' })).not.toBeInTheDocument()
    })

    it('lists the legacy key and explains why it cannot be managed here', () => {
      renderField({ keys: [LEGACY_KEY] })

      expect(screen.getByText('Issued outside Notify')).toBeInTheDocument()
      expect(screen.getByText(/cannot be regenerated here/)).toBeInTheDocument()
    })
  })

  describe('when the tenant has both a legacy and a self-service key', () => {
    it('manages the new one and lists the old one alongside it', () => {
      renderField({ keys: [EXISTING_KEY, LEGACY_KEY] })

      expect(screen.getByText('AED1708-PizzaPlanet')).toBeInTheDocument()
      expect(screen.getByText('Issued outside Notify')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Regenerate API Key' })).toBeEnabled()
      expect(screen.getByText(/revoke the old one on the API Services Portal/)).toBeInTheDocument()
    })

    it('regenerates the managed key, never the legacy one', async () => {
      dispatchMock.mockReturnValue(
        resolvesWith({ apiKey: 'rotated', clientId: 'AED1708-PizzaPlanet' }),
      )
      renderField({ keys: [EXISTING_KEY, LEGACY_KEY] })

      fireEvent.click(screen.getByRole('button', { name: 'Regenerate API Key' }))
      fireEvent.click(screen.getByRole('button', { name: 'Generate new key' }))

      await waitFor(() => expect(regenerateApiKey).toHaveBeenCalledWith('AED1708-PizzaPlanet'))
    })
  })

  it('renders its dialogs outside any surrounding form', () => {
    // ApiKeyField sits inside the Tenant Settings <form>. If the modal rendered inline,
    // its own <form> would be nested inside that one — and browsers refuse to submit a
    // nested form, so "Generate new key" fires no handler at all. jsdom does not
    // implement that rule, so only this structural assertion catches it here.
    renderField({ keys: [EXISTING_KEY] })
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate API Key' }))

    const submit = screen.getByRole('button', { name: 'Generate new key' })
    const owningForm = submit.closest('form')

    expect(owningForm).not.toBeNull()
    expect(owningForm?.closest('form:not(:scope)')).toBeNull()
    expect(document.querySelectorAll('form form')).toHaveLength(0)
  })

  it('surfaces a load error', () => {
    renderField({ error: 'Failed to load API keys' })

    expect(screen.getByText('Failed to load API keys')).toBeInTheDocument()
  })

  it('links out to the API gateway for revoking, which Notify does not do', () => {
    renderField({ keys: [EXISTING_KEY] })

    expect(screen.getByRole('link', { name: /Revoke API key/ })).toHaveAttribute('href')
  })

  it('keeps the links in the page, not inside the tooltip', () => {
    // A tooltip hides the moment the pointer leaves its trigger, so a link inside one
    // cannot be clicked and is invisible to the keyboard.
    renderField({ keys: [EXISTING_KEY] })

    const link = screen.getByRole('link', { name: /Learn more about API keys/ })
    expect(link.closest('[role="tooltip"]')).toBeNull()
  })
})
