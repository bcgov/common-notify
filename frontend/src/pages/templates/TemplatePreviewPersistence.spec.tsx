import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TemplatePreviewModal from './TemplatePreviewModal'
import EventsEmailPreviewModal from '../events/components/EventsEmailPreviewModal'
import { NotificationChannel, TemplateEngine } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'

const server = vi.hoisted(() => ({ params: {} as Record<string, string> }))
vi.mock('@/api/templates.api', async (importOriginal) => ({
  ...(await importOriginal<typeof TemplatesApi>()),
  getTemplatePreviewData: vi.fn(async () => ({ params: server.params })),
  saveTemplatePreviewData: vi.fn(async (_id, params: Record<string, string>) => {
    server.params = { ...params }
    return { params: server.params }
  }),
  previewTemplateBody: vi.fn(async ({ params }) => ({
    body: `Hello ${params.name}`,
    bodyType: 'text',
  })),
  previewTemplate: vi.fn(async (_id, params) => ({
    body: `Hello ${params.name}`,
    subject: 'Welcome',
    bodyType: 'text',
  })),
}))
vi.mock('@/hooks/useCstarRoles', () => ({ useCstarRoles: () => ({ canEdit: true }) }))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (state: { tenant: { selectedTenant: { id: string } } }) => unknown) =>
    selector({ tenant: { selectedTenant: { id: 'tenant-a' } } }),
}))
vi.mock('@/components/EmailHeader', () => ({ default: () => null }))

describe('shared editor and event preview data', () => {
  beforeEach(() => {
    server.params = {}
    vi.clearAllMocks()
  })

  it('loads values saved in the editor after leaving for the event preview', async () => {
    const template = {
      id: 'template-a',
      subject: 'Welcome',
      body: 'Hello {{name}}',
      channelCode: NotificationChannel.EMAIL,
      engineCode: TemplateEngine.HANDLEBARS,
    } as TemplateResponse
    const view = render(
      <TemplatePreviewModal
        isOpen
        onClose={vi.fn()}
        templateId={template.id}
        canSave
        body={template.body}
        subject={template.subject}
        channelCode={template.channelCode}
        engineCode={template.engineCode}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^name/ })).not.toHaveAttribute('readonly'),
    )
    await userEvent.type(screen.getByRole('textbox', { name: /^name/ }), 'Jane')
    await userEvent.click(screen.getByRole('button', { name: 'Apply to template' }))
    expect(await screen.findByText('Hello Jane')).toBeVisible()
    view.unmount()

    render(
      <EventsEmailPreviewModal
        isOpen
        onClose={vi.fn()}
        template={template}
        header={{ useCustomHeader: false, headerLogoId: null, headerTitle: null }}
        senderEmail="sender@example.com"
        toAddresses={[]}
        ccAddresses={[]}
        bccAddresses={[]}
      />,
    )
    expect(await screen.findByText('Hello Jane')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^name/ })).toHaveValue('Jane')
  })
})
