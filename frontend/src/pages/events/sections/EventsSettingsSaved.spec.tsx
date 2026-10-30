import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent, waitFor } from '@/test-utils'
import { getEventById } from '@/api/events.api'
import { getTemplateById } from '@/api/templates.api'
import EventsSettingsSaved from './EventsSettingsSaved'

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), tenant: 'tenant' as string | undefined }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ tenant: { selectedTenant: { id: mocks.tenant } } }),
}))
vi.mock('@/components/PageHeading', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('../components/EventsTabBar', () => ({
  default: ({ onSelect }: { onSelect: (tab: string) => void }) => (
    <button onClick={() => onSelect('settings')}>Settings tab</button>
  ),
}))
vi.mock('../components/EventsEmailPreview', () => ({ default: () => <div>Email preview</div> }))
vi.mock('@/api/events.api', () => ({ getEventById: vi.fn() }))
vi.mock('@/api/templates.api', () => ({ getTemplateById: vi.fn() }))

describe('EventsSettingsSaved', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tenant = 'tenant'
  })
  it('waits for tenant selection before fetching', () => {
    mocks.tenant = undefined
    render(<EventsSettingsSaved eventId="event" channel="email" />)
    expect(screen.getByText('Loading event...')).toBeInTheDocument()
    expect(getEventById).not.toHaveBeenCalled()
  })
  it('shows loading then missing settings', async () => {
    vi.mocked(getEventById).mockResolvedValue({ name: 'Renewal' } as Awaited<
      ReturnType<typeof getEventById>
    >)
    render(<EventsSettingsSaved eventId="event" channel="email" />)
    expect(screen.getByText('Loading event...')).toBeInTheDocument()
    expect(
      await screen.findByText('This event has no saved email notification settings yet.'),
    ).toBeInTheDocument()
  })
  it.each([new Error('Unavailable'), 'failure'])('shows load errors: %s', async (error) => {
    vi.mocked(getEventById).mockRejectedValue(error)
    render(<EventsSettingsSaved eventId="event" channel="email" />)
    expect(
      await screen.findByText(error instanceof Error ? error.message : 'Failed to load event'),
    ).toBeInTheDocument()
  })
  it.each([true, false])(
    'continues and edits even when template loading fails: %s',
    async (fails) => {
      vi.mocked(getEventById).mockResolvedValue({
        name: 'Renewal',
        emailSettings: { templateId: 'template' },
      } as Awaited<ReturnType<typeof getEventById>>)
      if (fails) vi.mocked(getTemplateById).mockRejectedValue(new Error('Template unavailable'))
      else
        vi.mocked(getTemplateById).mockResolvedValue({ id: 'template' } as Awaited<
          ReturnType<typeof getTemplateById>
        >)
      render(<EventsSettingsSaved eventId="event" channel="email" />)
      await userEvent.click(
        await screen.findByRole('button', { name: 'Continue to test notification' }),
      )
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/events/$eventId/email-test-send',
        params: { eventId: 'event' },
      })
      await userEvent.click(screen.getByRole('button', { name: 'Edit settings' }))
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/events/$eventId',
        params: { eventId: 'event' },
        search: { tab: 'email', edit: true },
      })
      await userEvent.click(screen.getByRole('button', { name: 'Settings tab' }))
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/events/$eventId',
        params: { eventId: 'event' },
        search: { tab: 'settings' },
      })
      await waitFor(() => expect(getTemplateById).toHaveBeenCalledWith('template'))
      if (!fails) expect(await screen.findByText('Email preview')).toBeInTheDocument()
    },
  )

  describe('for SMS', () => {
    function loadSms(active: boolean) {
      vi.mocked(getEventById).mockResolvedValue({
        name: 'Renewal',
        smsSettings: { active, templateId: 'sms-template', to: [] },
      } as unknown as Awaited<ReturnType<typeof getEventById>>)
      vi.mocked(getTemplateById).mockResolvedValue({
        id: 'sms-template',
        body: 'Your permit expires soon',
      } as Awaited<ReturnType<typeof getTemplateById>>)
    }

    it('shows the template and edits the SMS settings, with no test send yet', async () => {
      loadSms(true)
      render(<EventsSettingsSaved eventId="event" channel="sms" />)
      expect(await screen.findByText('Ready to send?')).toBeInTheDocument()
      expect(await screen.findByText('Your permit expires soon')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue to test notification' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Edit settings' }))
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/events/$eventId',
        params: { eventId: 'event' },
        search: { tab: 'sms', edit: true },
      })
    })

    it('asks for an inactive channel to be activated', async () => {
      loadSms(false)
      render(<EventsSettingsSaved eventId="event" channel="sms" />)
      expect(await screen.findByText('SMS settings saved')).toBeInTheDocument()
    })

    it('shows missing SMS settings', async () => {
      vi.mocked(getEventById).mockResolvedValue({ name: 'Renewal' } as Awaited<
        ReturnType<typeof getEventById>
      >)
      render(<EventsSettingsSaved eventId="event" channel="sms" />)
      expect(
        await screen.findByText('This event has no saved SMS notification settings yet.'),
      ).toBeInTheDocument()
    })
  })
})
