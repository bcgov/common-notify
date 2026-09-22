import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { NotificationChannel, TemplateEngine } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import Templates from './Templates'

const dispatchMock = vi.fn()
const deleteTemplateMock = vi.fn()
const getTemplateUsageMock = vi.fn()
let state: any
let canEdit = true

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, params, search }: { children: ReactNode; params?: any; search?: any }) => (
    <a href={`/events/${params?.eventId}?tab=${search?.tab}`}>{children}</a>
  ),
}))

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/thunks/templates.thunks', () => ({
  fetchTemplates: vi.fn(() => ({ type: 'templates/fetchAll' })),
}))

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    deleteTemplate: (...args: unknown[]) => deleteTemplateMock(...args),
    getTemplateUsage: (...args: unknown[]) => getTemplateUsageMock(...args),
  }
})

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

vi.mock('@/hooks/useCstarRoles', () => ({
  useCstarRoles: () => ({ canEdit }),
}))

function template(overrides: Partial<TemplateResponse> = {}): TemplateResponse {
  return {
    id: 'template-1',
    name: 'New Order Ready',
    channelCode: NotificationChannel.EMAIL,
    body: 'Hello',
    engineCode: TemplateEngine.HANDLEBARS,
    version: 1,
    active: true,
    createdBy: 'someone',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedBy: 'someone',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

function setState(items: TemplateResponse[], overrides: Partial<Record<string, unknown>> = {}) {
  state = {
    templates: {
      items,
      page: 1,
      limit: 15,
      count: items.length,
      search: '',
      sortBy: null,
      sortOrder: null,
      filters: {},
      isLoading: false,
      hasLoaded: true,
      ...overrides,
    },
    tenant: { selectedTenant: { id: 'tenant-1' } },
  }
}

async function openDeleteDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete New Order Ready' }))
  await waitFor(() => expect(getTemplateUsageMock).toHaveBeenCalledWith('template-1'))
}

describe('Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canEdit = true
    deleteTemplateMock.mockResolvedValue(undefined)
    getTemplateUsageMock.mockResolvedValue({ events: [] })
    setState([template()])
  })

  it('renders an Action column with a Delete button per row', () => {
    render(<Templates />)

    expect(screen.getByRole('columnheader', { name: 'Action' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete New Order Ready' })).toBeInTheDocument()
  })

  it('disables Delete for users who cannot edit templates', () => {
    canEdit = false
    render(<Templates />)

    expect(screen.getByRole('button', { name: 'Delete New Order Ready' })).toBeDisabled()
  })

  it('asks for confirmation before deleting and does nothing on cancel', async () => {
    render(<Templates />)
    await openDeleteDialog()

    expect(screen.getByText('Delete template?')).toBeInTheDocument()
    const message = screen.getByText(/Are you sure you want to delete/)
    expect(message).toHaveTextContent('New Order Ready')
    expect(message).toHaveTextContent('Last used:')
    expect(message).toHaveTextContent('Deleted templates can be restored from the Archive.')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete template?')).not.toBeInTheDocument()
    expect(deleteTemplateMock).not.toHaveBeenCalled()
  })

  it('deletes the template and refetches the list when confirmed', async () => {
    render(<Templates />)
    await openDeleteDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() => expect(deleteTemplateMock).toHaveBeenCalledWith('template-1'))
    expect(showSuccessToast).toHaveBeenCalledWith('New Order Ready deleted')
    await waitFor(() => expect(dispatchMock).toHaveBeenCalledWith({ type: 'templates/fetchAll' }))
    expect(screen.queryByText('Delete template?')).not.toBeInTheDocument()
  })

  it('steps back a page when the last row on it is deleted', async () => {
    setState([template()], { page: 2, count: 16 })
    render(<Templates />)
    await openDeleteDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'templates/setPage', payload: 1 }),
    )
  })

  it('reports a failed delete and keeps the dialog open', async () => {
    deleteTemplateMock.mockRejectedValue(new Error('Template not found'))
    render(<Templates />)
    await openDeleteDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith('Template not found'))
    expect(screen.getByText('Delete template?')).toBeInTheDocument()
  })

  it('refuses the delete and links to the events still using the template', async () => {
    getTemplateUsageMock.mockResolvedValue({
      events: [
        { id: 'event-1', name: 'Air Quality 2026', channelCode: NotificationChannel.EMAIL },
        { id: 'event-2', name: 'Wild Fire 2026', channelCode: NotificationChannel.SMS },
      ],
    })
    render(<Templates />)
    await openDeleteDialog()

    expect(await screen.findByText("Template can't be deleted")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes, delete' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Air Quality 2026' })).toHaveAttribute(
      'href',
      '/events/event-1?tab=email',
    )
    expect(screen.getByRole('link', { name: 'Wild Fire 2026' })).toHaveAttribute(
      'href',
      '/events/event-2?tab=sms',
    )

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByText("Template can't be deleted")).not.toBeInTheDocument()
    expect(deleteTemplateMock).not.toHaveBeenCalled()
  })
})
