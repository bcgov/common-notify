import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor } from '@/test-utils'
import CreateEvent from './CreateEvent'
import { createEvent } from '@/api/events.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const state = vi.hoisted(() => ({ canEdit: true, navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => state.navigate }))
vi.mock('@/hooks/useCstarRoles', () => ({ useCstarRoles: () => state }))
vi.mock('./components/EventsTabBar', () => ({ default: () => <div>Event tabs</div> }))
vi.mock('@/components/PageHeading', () => ({ default: () => <h1>Create New Event</h1> }))
vi.mock('@/api/events.api', () => ({ createEvent: vi.fn() }))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }))

async function fillForm() {
  await userEvent.type(screen.getByRole('textbox', { name: /Event name/ }), 'Renewal')
  await userEvent.type(screen.getByRole('textbox', { name: /Event description/ }), 'Annual renewal')
  await userEvent.click(screen.getByRole('button', { name: 'Save Event Settings' }))
}

describe('CreateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.canEdit = true
  })
  it('starts empty with save disabled', () => {
    render(<CreateEvent />)
    expect(screen.getByRole('textbox', { name: /Event name/ })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save Event Settings' })).toBeDisabled()
  })
  it('disables the form without edit permission', () => {
    state.canEdit = false
    render(<CreateEvent />)
    expect(screen.getByRole('textbox', { name: /Event name/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save Event Settings' })).toBeDisabled()
  })
  it('locks the form while saving and navigates to the created event', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof createEvent>>) => void
    vi.mocked(createEvent).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    render(<CreateEvent />)
    await fillForm()
    expect(screen.getByRole('textbox', { name: /Event name/ })).toBeDisabled()
    resolve({ id: 'event-1' } as Awaited<ReturnType<typeof createEvent>>)
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({
        to: '/events/$eventId',
        params: { eventId: 'event-1' },
      }),
    )
    expect(createEvent).toHaveBeenCalledWith({ name: 'Renewal', description: 'Annual renewal' })
    expect(showSuccessToast).toHaveBeenCalled()
  })
  it.each([new Error('Unavailable'), 'failure'])(
    'reports creation errors and keeps the form editable: %s',
    async (error) => {
      vi.mocked(createEvent).mockRejectedValue(error)
      render(<CreateEvent />)
      await fillForm()
      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith(
          error instanceof Error ? error.message : 'Failed to create event',
        ),
      )
      expect(state.navigate).not.toHaveBeenCalled()
      expect(screen.getByRole('textbox', { name: /Event name/ })).toHaveValue('Renewal')
      expect(screen.getByRole('button', { name: 'Save Event Settings' })).toBeEnabled()
    },
  )
})
