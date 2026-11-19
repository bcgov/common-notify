import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsSmsPreviewModal from './EventsSmsPreviewModal'
import { previewTemplate, TemplateEngine, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse, PreviewTemplateResponse } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
vi.mock('@/api/templates.api', async (importOriginal) => ({
  ...(await importOriginal<typeof TemplatesApi>()),
  previewTemplate: vi.fn(),
}))
const template = {
  id: 'template',
  body: 'Hello {{name}}',
  engineCode: TemplateEngine.HANDLEBARS,
  channelCode: NotificationChannel.SMS,
} as TemplateResponse
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(previewTemplate).mockImplementation(async (_id, params) => ({
    body: `Hello ${params?.name}`,
    templateId: 'template',
    bodyType: 'text',
    channelCode: NotificationChannel.SMS,
  }))
})

describe('SMS event preview', () => {
  it('updates automatically and saves sample values without changing the template', async () => {
    const onSaveValues = vi.fn()
    render(
      <EventsSmsPreviewModal
        template={template}
        to={['+12505551234']}
        initialValues={{ name: 'Alice' }}
        onClose={vi.fn()}
        onSaveValues={onSaveValues}
      />,
    )
    expect(await screen.findByText('Hello Alice')).toBeVisible()
    const input = screen.getByRole('textbox', { name: /^name(?:\s*\(required\))?$/i })
    await userEvent.clear(input)
    await userEvent.type(input, 'Bob')
    expect(await screen.findByText('Hello Bob')).toBeVisible()
    expect(screen.getByText(/Estimated parts: 1/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save notification values' }))
    expect(onSaveValues).toHaveBeenCalledWith({ name: 'Bob' })
  })

  it('does not allow a stale response to replace the latest preview', async () => {
    let resolveFirst!: (value: PreviewTemplateResponse) => void
    vi.mocked(previewTemplate).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    render(
      <EventsSmsPreviewModal
        template={template}
        to={[]}
        initialValues={{ name: 'Alice' }}
        onClose={vi.fn()}
        onSaveValues={vi.fn()}
      />,
    )
    await waitFor(() => expect(previewTemplate).toHaveBeenCalledTimes(1))
    const input = screen.getByRole('textbox', { name: /^name(?:\s*\(required\))?$/i })
    await userEvent.clear(input)
    await userEvent.type(input, 'Bob')
    expect(await screen.findByText('Hello Bob')).toBeVisible()
    resolveFirst({
      body: 'Old response',
      templateId: 'template',
      bodyType: 'text',
      channelCode: NotificationChannel.SMS,
    })
    await waitFor(() => expect(screen.queryByText('Old response')).not.toBeInTheDocument())
  })

  it('shows the error when the preview fails', async () => {
    vi.mocked(previewTemplate).mockRejectedValue(new Error('Missing personalisation: name'))
    render(
      <EventsSmsPreviewModal
        template={template}
        to={[]}
        initialValues={{ name: 'Alice' }}
        onClose={vi.fn()}
        onSaveValues={vi.fn()}
      />,
    )

    expect(await screen.findByText('Missing personalisation: name')).toBeVisible()
  })

  it('falls back to a generic message for a non-Error failure', async () => {
    vi.mocked(previewTemplate).mockRejectedValue('nope')
    render(
      <EventsSmsPreviewModal
        template={template}
        to={[]}
        initialValues={{ name: 'Alice' }}
        onClose={vi.fn()}
        onSaveValues={vi.fn()}
      />,
    )

    expect(await screen.findByText('Unable to render preview. Try again.')).toBeVisible()
  })

  it('defaults a boolean to true and sends False as an empty string', async () => {
    const booleanTemplate = { ...template, body: '{{#if urgent}}Urgent{{/if}} {{name}}' }
    render(
      <EventsSmsPreviewModal
        template={booleanTemplate}
        to={[]}
        initialValues={{ name: 'Alice' }}
        onClose={vi.fn()}
        onSaveValues={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(previewTemplate).toHaveBeenCalledWith('template', { urgent: 'true', name: 'Alice' }),
    )

    await userEvent.click(screen.getByRole('radio', { name: 'False' }))

    await waitFor(() =>
      expect(previewTemplate).toHaveBeenLastCalledWith('template', { urgent: '', name: 'Alice' }),
    )
  })

  it('does not save while a value is missing', async () => {
    const onSaveValues = vi.fn()
    render(
      <EventsSmsPreviewModal
        template={template}
        to={[]}
        initialValues={{}}
        onClose={vi.fn()}
        onSaveValues={onSaveValues}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save notification values' }))

    expect(onSaveValues).not.toHaveBeenCalled()
    expect(await screen.findByText('Enter a value.')).toBeInTheDocument()
  })

  it('dismisses the info notice', async () => {
    render(
      <EventsSmsPreviewModal
        template={template}
        to={[]}
        initialValues={{ name: 'Alice' }}
        onClose={vi.fn()}
        onSaveValues={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close this alert' }))

    expect(screen.queryByText(/Nothing is sent from this preview/)).not.toBeInTheDocument()
  })
})
