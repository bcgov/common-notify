import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import Events from './Events'
import eventsReducer from '@/redux/slices/events.slice'
import tenantReducer, { selectTenant } from '@/redux/slices/tenant.slice'
import userReducer from '@/redux/slices/user.slice'
import { EventStatus, getEvents } from '@/api/events.api'
import type * as EventsApi from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { showErrorToast } from '@/redux/utils/toastUtils'
import type { Tenant } from '@/interfaces/CstarTenant'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({
    children,
    to,
    params = {},
  }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a
      href={Object.entries(params).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
    >
      {children}
    </a>
  ),
}))

vi.mock('@/api/events.api', async () => {
  const actual = await vi.importActual<typeof EventsApi>('@/api/events.api')
  return { ...actual, getEvents: vi.fn() }
})

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

vi.mock('@mui/icons-material/KeyboardArrowDown', () => ({ default: () => <span>▼</span> }))
vi.mock('@mui/icons-material/KeyboardArrowUp', () => ({ default: () => <span>▲</span> }))
vi.mock('@mui/icons-material/UnfoldMore', () => ({ default: () => <span>⇅</span> }))

const event = (overrides: Partial<EventResponse> = {}): EventResponse => ({
  id: 'event-1',
  name: 'Permit renewal',
  description: 'Sent when a permit is about to expire',
  channelCodes: ['EMAIL'],
  status: EventStatus.ACTIVE,
  emailSettings: null,
  smsSettings: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T18:30:00.000Z',
  ...overrides,
})

const pageOf = (items: EventResponse[], overrides: Record<string, unknown> = {}) => ({
  data: items,
  count: items.length,
  page: 1,
  limit: 15,
  totalPages: 1,
  ...overrides,
})

function makeStore(
  cstarRoles: string[] = ['NOTIFY_OPERATIONS_ADMIN'],
  selectedTenant: Tenant | null = { id: 'tenant-1', name: 'Test Tenant' } as Tenant,
) {
  return configureStore({
    reducer: { events: eventsReducer, tenant: tenantReducer, user: userReducer },
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

function renderPage(...args: Parameters<typeof makeStore>) {
  const store = makeStore(...args)
  return {
    store,
    ...render(
      <Provider store={store}>
        <Events />
      </Provider>,
    ),
  }
}

const searchBox = () => screen.getByRole('searchbox', { name: 'Search events' })

describe('Events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getEvents).mockResolvedValue(pageOf([event()]))
  })

  describe('tenant scoping', () => {
    it('waits for a tenant before it asks for anything', () => {
      renderPage(['NOTIFY_OPERATIONS_ADMIN'], null)

      expect(getEvents).not.toHaveBeenCalled()
    })

    it('fetches the first page for the selected tenant', async () => {
      renderPage()

      await waitFor(() =>
        expect(getEvents).toHaveBeenCalledWith(1, 15, undefined, undefined, undefined),
      )
    })

    it('refetches when the tenant is switched', async () => {
      const { store } = renderPage()

      await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(1))

      await act(async () => {
        store.dispatch(selectTenant({ id: 'tenant-2', name: 'Other Tenant' } as Tenant))
      })

      await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(2))
    })
  })

  describe('the table', () => {
    it('lists each event, linking its name to the event', async () => {
      vi.mocked(getEvents).mockResolvedValue(
        pageOf([event(), event({ id: 'event-2', name: 'Licence expiry' })]),
      )
      renderPage()

      expect(await screen.findByRole('link', { name: 'Permit renewal' })).toHaveAttribute(
        'href',
        '/events/event-1',
      )
      expect(screen.getByRole('link', { name: 'Licence expiry' })).toHaveAttribute(
        'href',
        '/events/event-2',
      )
    })

    it('shows the channels, description and status of an event', async () => {
      vi.mocked(getEvents).mockResolvedValue(
        pageOf([event({ channelCodes: ['EMAIL', 'SMS'], status: EventStatus.DRAFT })]),
      )
      renderPage()

      const row = (await screen.findByRole('link', { name: 'Permit renewal' })).closest(
        'tr',
      ) as HTMLElement
      expect(within(row).getByText('Email')).toBeInTheDocument()
      expect(within(row).getByText('SMS')).toBeInTheDocument()
      expect(within(row).getByText('Sent when a permit is about to expire')).toBeInTheDocument()
      expect(within(row).getByText('Draft')).toBeInTheDocument()
    })

    it('announces that it is loading while the first page is on its way', async () => {
      vi.mocked(getEvents).mockImplementation(() => new Promise(() => {}))
      renderPage()

      expect(await screen.findByText('Loading...')).toBeInTheDocument()
    })

    it('says so when the tenant has no events', async () => {
      vi.mocked(getEvents).mockResolvedValue(pageOf([]))
      renderPage()

      expect(await screen.findByRole('cell', { name: 'No events found' })).toBeInTheDocument()
    })

    it('surfaces a failed load as a toast, since the table can only show an empty state', async () => {
      vi.mocked(getEvents).mockRejectedValue(new Error('You do not have permission to view events'))
      renderPage()

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith('You do not have permission to view events'),
      )
      expect(screen.getByRole('cell', { name: 'No events found' })).toBeInTheDocument()
    })
  })

  describe('searching', () => {
    it('fetches with the term entered', async () => {
      renderPage()
      await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(1))

      await userEvent.type(searchBox(), 'permit')
      await userEvent.click(screen.getByRole('button', { name: 'Search' }))

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(1, 15, 'permit', undefined, undefined),
      )
    })

    it('retries the same term rather than doing nothing, which is the path after a failed load', async () => {
      renderPage()
      await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(1))

      await userEvent.click(screen.getByRole('button', { name: 'Search' }))

      await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(2))
      expect(getEvents).toHaveBeenLastCalledWith(1, 15, undefined, undefined, undefined)
    })

    it('searches when Enter is pressed in the field', async () => {
      renderPage()
      await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(1))

      await userEvent.type(searchBox(), 'permit{Enter}')

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(1, 15, 'permit', undefined, undefined),
      )
    })
  })

  describe('sorting and filtering', () => {
    it('sorts on a column and marks it in the header', async () => {
      renderPage()
      await screen.findByRole('link', { name: 'Permit renewal' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Column options for Notification Event' }),
      )
      await userEvent.click(await screen.findByRole('menuitem', { name: 'A to Z' }))

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(1, 15, undefined, 'name', undefined),
      )
      expect(screen.getByRole('columnheader', { name: /Notification Event/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      )
    })

    it('sorts the last updated column newest first', async () => {
      renderPage()
      await screen.findByRole('link', { name: 'Permit renewal' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Column options for Last Updated Date' }),
      )
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Newest to Oldest' }))

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(1, 15, undefined, '-updatedAt', undefined),
      )
    })

    it('filters on event status', async () => {
      renderPage()
      await screen.findByRole('link', { name: 'Permit renewal' })

      await userEvent.click(screen.getByRole('button', { name: 'Column options for Event Status' }))
      await userEvent.hover(await screen.findByRole('menuitem', { name: /Filter by/ }))
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Active' }))
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(1, 15, undefined, undefined, [
          'status:in:ACTIVE',
        ]),
      )
    })

    it('filters on channel', async () => {
      renderPage()
      await screen.findByRole('link', { name: 'Permit renewal' })

      await userEvent.click(screen.getByRole('button', { name: 'Column options for Channel' }))
      await userEvent.hover(await screen.findByRole('menuitem', { name: /Filter by/ }))
      await userEvent.click(await screen.findByRole('checkbox', { name: 'SMS' }))
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(1, 15, undefined, undefined, [
          'channelCodes:in:SMS',
        ]),
      )
    })
  })

  describe('paging', () => {
    // The API echoes back the page and size it was asked for, so the slice does not reset them.
    const respondWithRequestedPage = () =>
      vi
        .mocked(getEvents)
        .mockImplementation(async (page = 1, limit = 15) =>
          pageOf([event()], { count: 40, totalPages: Math.ceil(40 / limit), page, limit }),
        )

    it('fetches the next page', async () => {
      respondWithRequestedPage()
      renderPage()
      await screen.findByRole('link', { name: 'Permit renewal' })

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(2, 15, undefined, undefined, undefined),
      )
    })

    it('fetches from the first page again with a new page size', async () => {
      respondWithRequestedPage()
      renderPage()
      await screen.findByRole('link', { name: 'Permit renewal' })

      await userEvent.selectOptions(screen.getByLabelText('Items per page'), '30')

      await waitFor(() =>
        expect(getEvents).toHaveBeenLastCalledWith(1, 30, undefined, undefined, undefined),
      )
    })
  })

  describe('creating an event', () => {
    it('is offered to a user who may edit', async () => {
      renderPage(['NOTIFY_TEMPLATE_EDITOR'])

      const button = screen.getByRole('button', { name: 'Create New Event' })
      expect(button).toBeEnabled()

      await userEvent.click(button)

      expect(navigateMock).toHaveBeenCalledWith({ to: '/events/create' })
    })

    it('is shown but unavailable to a viewer', async () => {
      renderPage(['NOTIFY_VIEWER'])

      expect(screen.getByRole('button', { name: 'Create New Event' })).toBeDisabled()

      await userEvent.click(screen.getByRole('button', { name: 'Create New Event' }))

      expect(navigateMock).not.toHaveBeenCalled()
    })
  })
})
