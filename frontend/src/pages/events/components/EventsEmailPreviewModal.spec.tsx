import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsEmailPreviewModal from './EventsEmailPreviewModal'
import {
  getTemplatePreviewData,
  saveTemplatePreviewData,
  previewTemplate,
  TemplateEngine,
  NotificationChannel,
} from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'

vi.mock('@/api/templates.api', async (importOriginal) => ({
  ...(await importOriginal<typeof TemplatesApi>()),
  previewTemplate: vi.fn(),
  getTemplatePreviewData: vi.fn(),
  saveTemplatePreviewData: vi.fn(),
}))
const permissions = vi.hoisted(() => ({ canEdit: true }))
vi.mock('@/hooks/useCstarRoles', () => ({ useCstarRoles: () => permissions }))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (state: { tenant: { selectedTenant: { id: string } } }) => unknown) =>
    selector({ tenant: { selectedTenant: { id: 'tenant-a' } } }),
}))
// The header reads the store; it has its own spec.
vi.mock('@/components/EmailHeader', () => ({ default: () => <div>Email header</div> }))

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
  permissions.canEdit = true
  vi.mocked(getTemplatePreviewData).mockResolvedValue({ params: {} })
  vi.mocked(saveTemplatePreviewData).mockResolvedValue({ params: {} })
  vi.mocked(previewTemplate).mockImplementation(async (_id, params) => ({
    subject: `Permit for ${params?.name}`,
    body: params?.approved ? 'Approved' : 'Declined',
    templateId: 'template',
    bodyType: 'text',
    channelCode: NotificationChannel.EMAIL,
  }))
})

describe('EventsEmailPreviewModal', () => {
  it('loads shared values before rendering and ignores removed placeholders', async () => {
    vi.mocked(getTemplatePreviewData).mockResolvedValue({
      params: { name: 'Jane', approved: 'false', removed: 'Old' },
    })
    renderModal()
    expect(await screen.findByText('Declined')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue('Jane')
    expect(previewTemplate).toHaveBeenCalledWith('template', { name: 'Jane', approved: '' })
    expect(saveTemplatePreviewData).not.toHaveBeenCalled()
  })

  it('saves the form strings on Apply and restores them on another visit', async () => {
    let params: Record<string, string> = { name: 'Jane', approved: 'true' }
    vi.mocked(getTemplatePreviewData).mockImplementation(async () => ({ params }))
    vi.mocked(saveTemplatePreviewData).mockImplementation(async (_id, values) => {
      params = values
      return { params }
    })
    const view = renderModal()
    await screen.findByText('Approved')
    await userEvent.clear(screen.getByRole('textbox', { name: /^name/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /^name/i }), 'Ada')
    await userEvent.click(screen.getByRole('radio', { name: 'False' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Preview' }))
    await screen.findByText('Declined')
    expect(saveTemplatePreviewData).toHaveBeenCalledWith('template', {
      name: 'Ada',
      approved: 'false',
    })
    view.unmount()
    renderModal()
    await screen.findByText('Declined')
    expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue('Ada')
  })

  it('lets viewers apply local changes without saving', async () => {
    permissions.canEdit = false
    renderModal()
    await screen.findByText('Approved')
    await userEvent.type(screen.getByRole('textbox', { name: /^name/i }), 'Viewer')
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Preview' }))
    expect(await screen.findByText('Permit for Viewer')).toBeVisible()
    expect(saveTemplatePreviewData).not.toHaveBeenCalled()
  })

  it('announces loading and load errors and retries', async () => {
    let rejectLoad!: (error: Error) => void
    vi.mocked(getTemplatePreviewData).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectLoad = reject
        }),
    )
    renderModal()
    expect(screen.getByRole('status')).toHaveTextContent('Loading preview values')
    expect(screen.getByRole('button', { name: 'Apply to Preview' })).toBeDisabled()
    rejectLoad(new Error('Cannot load values'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot load values')
    await userEvent.click(screen.getByRole('button', { name: /Retry loading/ }))
    expect(await screen.findByText('Approved')).toBeVisible()
  })

  it('retains edited values after save failure for retry', async () => {
    vi.mocked(saveTemplatePreviewData)
      .mockRejectedValueOnce(new Error('Cannot save values'))
      .mockResolvedValueOnce({ params: {} })
    renderModal()
    await screen.findByText('Approved')
    await userEvent.type(screen.getByRole('textbox', { name: /^name/i }), 'Ada')
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Preview' }))
    expect(await screen.findByText('Cannot save values')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue('Ada')
    await userEvent.click(screen.getByRole('button', { name: 'Apply to Preview' }))
    expect(await screen.findByText('Permit for Ada')).toBeVisible()
  })

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
      screen.queryByText(/Sample values are shared with the template editor/),
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
