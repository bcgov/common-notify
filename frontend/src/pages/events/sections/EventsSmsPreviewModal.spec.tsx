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
    const input = screen.getByRole('textbox', { name: 'name' })
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
    const input = screen.getByRole('textbox', { name: 'name' })
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
})
