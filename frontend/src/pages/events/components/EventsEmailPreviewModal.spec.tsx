import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsEmailPreviewModal from './EventsEmailPreviewModal'
import { previewTemplate, TemplateEngine, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'

vi.mock('@/api/templates.api', async (importOriginal) => ({
  ...(await importOriginal<typeof TemplatesApi>()),
  previewTemplate: vi.fn(),
}))
// The header reads the store; it has its own spec.
vi.mock('./EventsEmailHeader', () => ({ default: () => <div>Email header</div> }))

const template = {
  id: 'template',
  subject: 'Permit for {{name}}',
  body: '{{#if approved}}Approved{{else}}Declined{{/if}}',
  engineCode: TemplateEngine.HANDLEBARS,
  channelCode: NotificationChannel.EMAIL,
} as TemplateResponse

const header = {
  useCustomHeader: false,
  headerLogoId: null,
  headerTitle: null,
} as Parameters<typeof EventsEmailPreviewModal>[0]['header']

function renderModal(props: Partial<Parameters<typeof EventsEmailPreviewModal>[0]> = {}) {
  return render(
    <EventsEmailPreviewModal
      isOpen
      onClose={vi.fn()}
      template={template}
      header={header}
      senderEmail="permits@gov.bc.ca"
      toAddresses={['a@example.com', 'b@example.com']}
      ccAddresses={[]}
      bccAddresses={[]}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(previewTemplate).mockImplementation(async (_id, params) => ({
    subject: `Permit for ${params?.name}`,
    body: params?.approved ? 'Approved' : 'Declined',
    templateId: 'template',
    bodyType: 'text',
    channelCode: NotificationChannel.EMAIL,
  }))
})

describe('EventsEmailPreviewModal', () => {
  it('renders on open with a variable from the subject and booleans defaulting to true', async () => {
    renderModal()

    await waitFor(() =>
      expect(previewTemplate).toHaveBeenCalledWith('template', { name: '', approved: 'true' }),
    )
    expect(await screen.findByText('Approved')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^name/i })).toBeVisible()
    expect(screen.getByText('permits@gov.bc.ca')).toBeVisible()
    expect(screen.getByText('a@example.com, b@example.com')).toBeVisible()
  })

  it('applies edited values, sending a False boolean as an empty string', async () => {
    renderModal()
    await screen.findByText('Approved')

    await userEvent.type(screen.getByRole('textbox', { name: /^name/i }), 'Alice')
    await userEvent.click(screen.getByRole('radio', { name: 'False' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Preview' }))

    await waitFor(() =>
      expect(previewTemplate).toHaveBeenLastCalledWith('template', { name: 'Alice', approved: '' }),
    )
    expect(await screen.findByText('Declined')).toBeVisible()
    expect(screen.getByText('Permit for Alice')).toBeVisible()
  })

  it('shows the rendered HTML in a frame', async () => {
    vi.mocked(previewTemplate).mockResolvedValue({
      subject: 'Permit',
      body: 'Approved',
      html: '<p>Approved</p>',
      templateId: 'template',
      bodyType: 'html',
      channelCode: NotificationChannel.EMAIL,
    })
    renderModal()

    expect(await screen.findByTitle('Rendered email')).toBeInTheDocument()
  })

  it('shows the error when the preview fails', async () => {
    vi.mocked(previewTemplate).mockRejectedValue(new Error('Missing personalisation: name'))
    renderModal()

    expect(await screen.findByText('Missing personalisation: name')).toBeVisible()
  })

  it('falls back to a generic message for a non-Error failure', async () => {
    vi.mocked(previewTemplate).mockRejectedValue('nope')
    renderModal()

    expect(await screen.findByText('Failed to render preview')).toBeVisible()
  })

  it('dismisses the info notice', async () => {
    renderModal()
    await screen.findByText('Approved')

    await userEvent.click(screen.getByRole('button', { name: 'Close this alert' }))

    expect(
      screen.queryByText(/Preview values are generated from your API payload/),
    ).not.toBeInTheDocument()
  })

  it('handles a template and a response without a subject', async () => {
    vi.mocked(previewTemplate).mockResolvedValue({
      body: 'Approved',
      templateId: 'template',
      bodyType: 'text',
      channelCode: NotificationChannel.EMAIL,
    })
    renderModal({ template: { ...template, subject: undefined } })

    expect(await screen.findByText('Approved')).toBeVisible()
    expect(previewTemplate).toHaveBeenCalledWith('template', { approved: 'true' })
  })

  it('does not render a preview while closed', () => {
    renderModal({ isOpen: false })

    expect(previewTemplate).not.toHaveBeenCalled()
  })
})
