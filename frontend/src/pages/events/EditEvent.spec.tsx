import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import EditEvent from './EditEvent'
import tenantReducer, { selectTenant } from '@/redux/slices/tenant.slice'
import tenantSettingsReducer from '@/redux/slices/tenantSettings.slice'
import emailSettingsReducer from '@/redux/slices/emailSettings.slice'
import userReducer from '@/redux/slices/user.slice'
import {
  EventStatus,
  deactivateEventEmailChannel,
  getEventById,
  updateEvent,
  updateEventEmailSettings,
} from '@/api/events.api'
import type * as EventsApi from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { getApprovedEmailLogos, getSettings } from '@/api/settings.api'
import type * as SettingsApi from '@/api/settings.api'
import type * as TemplatesApi from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import type { Tenant } from '@/interfaces/CstarTenant'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

vi.mock('@/api/events.api', async () => {
  const actual = await vi.importActual<typeof EventsApi>('@/api/events.api')
  return {
    ...actual,
    getEventById: vi.fn(),
    updateEvent: vi.fn(),
    updateEventEmailSettings: vi.fn(),
    deactivateEventEmailChannel: vi.fn(),
    updateEventSmsSettings: vi.fn(),
    deactivateEventSmsChannel: vi.fn(),
  }
})

vi.mock('@/api/settings.api', async () => {
  const actual = await vi.importActual<typeof SettingsApi>('@/api/settings.api')
  return { ...actual, getSettings: vi.fn(), getApprovedEmailLogos: vi.fn() }
})

vi.mock('@/api/cstar.api', () => ({
  cstarApi: { fetchTenantGroups: vi.fn().mockResolvedValue([]) },
}))

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    getTemplates: vi.fn().mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      limit: 100,
      totalPages: 1,
    }),
    previewTemplate: vi.fn(),
  }
})

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

const event = (overrides: Partial<EventResponse> = {}): EventResponse => ({
  id: 'event-1',
  name: 'Permit renewal',
  description: 'Sent when a permit is about to expire',
  channelCodes: [],
  status: EventStatus.DRAFT,
  emailSettings: null,
  smsSettings: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  ...overrides,
})

const configuredEmail = {
  active: true,
  senderEmail: 'permits@gov.bc.ca',
  templateId: 'template-1',
  to: ['alice@gov.bc.ca'],
  cc: [],
  bcc: [],
  cstarGroupIdsTo: [],
  cstarGroupIdsCc: [],
  cstarGroupIdsBcc: [],
  useCustomHeader: false,
  headerLogoId: null,
  headerTitle: null,
}

function makeStore(
  cstarRoles: string[] = ['NOTIFY_OPERATIONS_ADMIN'],
  selectedTenant: Tenant | null = { id: 'tenant-1', name: 'Test Tenant' } as Tenant,
) {
  return configureStore({
    reducer: {
      tenant: tenantReducer,
      tenantSettings: tenantSettingsReducer,
      emailSettings: emailSettingsReducer,
      user: userReducer,
    },
    preloadedState: {
      tenant: { selectedTenant, showTenantModal: false },
      user: {
        current: { cstarRoles } as any,
        isLoading: false,
        rolesLoading: false,
        rolesTenantId: null,
        error: null,
        rolesError: null,
      },
    },
  })
}

function renderPage({
  cstarRoles,
  selectedTenant,
  eventId = 'event-1',
  initialTab,
}: {
  cstarRoles?: string[]
  selectedTenant?: Tenant | null
  eventId?: string
  initialTab?: 'settings' | 'email' | 'sms' | 'third-party'
} = {}) {
  const store = makeStore(cstarRoles, selectedTenant)
  const view = render(
    <Provider store={store}>
      <EditEvent eventId={eventId} initialTab={initialTab} />
    </Provider>,
  )
  return { store, ...view }
}

describe('EditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getEventById).mockResolvedValue(event())
    vi.mocked(updateEvent).mockImplementation(async (_id, data) => event(data))
    vi.mocked(updateEventEmailSettings).mockResolvedValue(event({ emailSettings: configuredEmail }))
    vi.mocked(deactivateEventEmailChannel).mockResolvedValue(
      event({ emailSettings: { ...configuredEmail, active: false } }),
    )
    vi.mocked(getSettings).mockResolvedValue(null)
    vi.mocked(getApprovedEmailLogos).mockResolvedValue([])
  })

  describe('tenant scoping', () => {
    it('does not fetch the event, or the tenant settings, until a tenant is selected', async () => {
      renderPage({ selectedTenant: null })

      expect(getEventById).not.toHaveBeenCalled()
      expect(getSettings).not.toHaveBeenCalled()
      expect(getApprovedEmailLogos).not.toHaveBeenCalled()
      // Until the event arrives the page says it is loading rather than showing an empty form.
      expect(screen.getByText('Loading event...')).toBeInTheDocument()
    })

    it('fetches once a tenant is selected, even when it arrives after the page has mounted', async () => {
      const { store } = renderPage({ selectedTenant: null })

      await act(async () => {
        store.dispatch(selectTenant({ id: 'tenant-1', name: 'Test Tenant' } as Tenant))
      })

      await waitFor(() => expect(getEventById).toHaveBeenCalledWith('event-1'))
      expect(getSettings).toHaveBeenCalled()
      expect(getApprovedEmailLogos).toHaveBeenCalled()
    })

    it('re-fetches the event when the tenant is switched', async () => {
      const { store } = renderPage()

      await waitFor(() => expect(getEventById).toHaveBeenCalledTimes(1))

      await act(async () => {
        store.dispatch(selectTenant({ id: 'tenant-2', name: 'Other Tenant' } as Tenant))
      })

      await waitFor(() => expect(getEventById).toHaveBeenCalledTimes(2))
    })

    it("drops the event it was showing when the other tenant's fetch fails", async () => {
      const { store } = renderPage()

      expect(await screen.findByRole('heading', { name: 'Permit renewal' })).toBeInTheDocument()

      vi.mocked(getEventById).mockRejectedValue(new Error('Event not found'))
      await act(async () => {
        store.dispatch(selectTenant({ id: 'tenant-2', name: 'Other Tenant' } as Tenant))
      })

      expect(await screen.findByText('Event not found')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: /Event name/ })).not.toBeInTheDocument()
    })
  })

  describe('loading the event', () => {
    it('names the event in the heading and the breadcrumb', async () => {
      renderPage()

      expect(await screen.findByRole('heading', { name: 'Permit renewal' })).toBeInTheDocument()
      const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(breadcrumb).toHaveTextContent('Home')
      expect(breadcrumb).toHaveTextContent('Permit renewal')
    })

    it('reports a failed load in place of the tabs content', async () => {
      vi.mocked(getEventById).mockRejectedValue(
        new Error('You do not have permission to view this event'),
      )
      renderPage()

      expect(
        await screen.findByText('You do not have permission to view this event'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Loading event...')).not.toBeInTheDocument()
    })
  })

  describe('the tabs', () => {
    it('opens on the event settings', async () => {
      renderPage()

      expect(await screen.findByRole('heading', { name: 'Event Settings' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Event Settings' })).toBeChecked()
    })

    it('opens on the tab it was handed', async () => {
      renderPage({ initialTab: 'email' })

      expect(await screen.findByRole('switch', { name: 'Activate channel' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Email Notification' })).toBeChecked()
    })

    it('switches to another channel without re-fetching the event', async () => {
      renderPage()

      await screen.findByRole('heading', { name: 'Event Settings' })
      await userEvent.click(screen.getByRole('radio', { name: 'SMS Notification' }))

      expect(screen.getByRole('switch', { name: 'Activate channel' })).toBeInTheDocument()
      expect(getEventById).toHaveBeenCalledTimes(1)
    })

    it('shows the third-party channel as not available yet', async () => {
      renderPage()

      await screen.findByRole('heading', { name: 'Event Settings' })
      await userEvent.click(screen.getByRole('radio', { name: 'Third-party Notification' }))

      expect(screen.getByRole('switch', { name: 'Activate channel' })).toBeDisabled()
    })
  })

  describe('saving the event settings', () => {
    it('persists the change and confirms it', async () => {
      renderPage()

      const nameField = await screen.findByRole('textbox', { name: /Event name/ })
      await userEvent.clear(nameField)
      await userEvent.type(nameField, 'Permit renewal reminder')
      await userEvent.click(screen.getByRole('button', { name: 'Save Event Settings' }))

      await waitFor(() =>
        expect(updateEvent).toHaveBeenCalledWith('event-1', {
          name: 'Permit renewal reminder',
          description: 'Sent when a permit is about to expire',
        }),
      )
      expect(showSuccessToast).toHaveBeenCalledWith('Event updated successfully')
      // The saved event is what the page then shows, heading included.
      expect(
        await screen.findByRole('heading', { name: 'Permit renewal reminder' }),
      ).toBeInTheDocument()
    })

    it('reports a failed save', async () => {
      vi.mocked(updateEvent).mockRejectedValue(new Error('An event with this name already exists'))
      renderPage()

      const nameField = await screen.findByRole('textbox', { name: /Event name/ })
      await userEvent.type(nameField, ' reminder')
      await userEvent.click(screen.getByRole('button', { name: 'Save Event Settings' }))

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith('An event with this name already exists'),
      )
      expect(screen.getByRole('heading', { name: 'Permit renewal' })).toBeInTheDocument()
    })
  })

  describe('the email channel', () => {
    it('sends the tab settings and hands off to the saved page', async () => {
      vi.mocked(getEventById).mockResolvedValue(event({ emailSettings: configuredEmail }))
      renderPage({ initialTab: 'email' })

      const senderField = await screen.findByRole('textbox', { name: /Sender email address/ })
      await userEvent.clear(senderField)
      await userEvent.type(senderField, 'renewals@gov.bc.ca')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() =>
        expect(updateEventEmailSettings).toHaveBeenCalledWith('event-1', {
          active: true,
          senderEmail: 'renewals@gov.bc.ca',
          templateId: 'template-1',
          to: ['alice@gov.bc.ca'],
          cc: [],
          bcc: [],
          cstarGroupIdsTo: [],
          cstarGroupIdsCc: [],
          cstarGroupIdsBcc: [],
          useCustomHeader: false,
          headerLogoId: null,
          headerTitle: null,
        }),
      )
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/events/$eventId/saved',
        params: { eventId: 'event-1' },
      })
    })

    it('switches the channel off on its own, once confirmed', async () => {
      vi.mocked(getEventById).mockResolvedValue(event({ emailSettings: configuredEmail }))
      renderPage({ initialTab: 'email' })

      await userEvent.click(await screen.findByRole('switch', { name: 'Activate channel' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))

      await waitFor(() => expect(deactivateEventEmailChannel).toHaveBeenCalledWith('event-1'))
      expect(updateEventEmailSettings).not.toHaveBeenCalled()
      expect(navigateMock).not.toHaveBeenCalled()
    })
  })

  describe('without the role to edit', () => {
    it('shows the event settings read-only', async () => {
      renderPage({ cstarRoles: ['NOTIFY_VIEWER'] })

      expect(await screen.findByRole('textbox', { name: /Event name/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Save Event Settings' })).toBeDisabled()
    })

    it('leaves the email channel switch locked', async () => {
      vi.mocked(getEventById).mockResolvedValue(event({ emailSettings: configuredEmail }))
      renderPage({ cstarRoles: ['NOTIFY_VIEWER'], initialTab: 'email' })

      expect(await screen.findByRole('switch', { name: 'Activate channel' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })
  })

  describe('with the role to edit', () => {
    it('leaves the event settings editable', async () => {
      renderPage({ cstarRoles: ['NOTIFY_TEMPLATE_EDITOR'] })

      expect(await screen.findByRole('textbox', { name: /Event name/ })).toBeEnabled()
    })
  })
})
