import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTestSendRowPreview } from './useTestSendRowPreview'
import { previewTemplate, NotificationChannel } from '@/api/templates.api'
import type { PreviewTemplateResponse } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import type { ParsedCsv } from '@/utils/bulkNotificationsCsv'

vi.mock('@/api/templates.api', async (importOriginal) => ({
  ...(await importOriginal<typeof TemplatesApi>()),
  previewTemplate: vi.fn(),
}))

const rows: ParsedCsv = { headers: ['email_address', 'name'], rows: [['a@example.com', 'Alice']] }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTestSendRowPreview', () => {
  it('renders the row, with an empty subject when the response has none', async () => {
    vi.mocked(previewTemplate).mockResolvedValue({
      body: 'Hello Alice',
      html: '<p>Hello Alice</p>',
      templateId: 'template',
      bodyType: 'html',
      channelCode: NotificationChannel.EMAIL,
    })
    const { result } = renderHook(() => useTestSendRowPreview(rows, 'template'))

    await waitFor(() =>
      expect(result.current.rowRendered).toEqual({
        subject: '',
        bodyHtml: '<p>Hello Alice</p>',
        bodyText: 'Hello Alice',
      }),
    )
    expect(result.current.isRowLoading).toBe(false)
  })

  it('shows nothing rendered when the preview fails', async () => {
    vi.mocked(previewTemplate).mockRejectedValue(new Error('Missing personalisation: name'))
    const { result } = renderHook(() => useTestSendRowPreview(rows, 'template'))

    await waitFor(() => expect(result.current.isRowLoading).toBe(false))
    expect(result.current.rowRendered).toBeNull()
  })

  it('ignores a response that lands after unmounting', async () => {
    let resolve!: (value: PreviewTemplateResponse) => void
    vi.mocked(previewTemplate).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    const { result, unmount } = renderHook(() => useTestSendRowPreview(rows, 'template'))
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled())

    unmount()
    resolve({
      subject: 'Late',
      body: 'Late',
      templateId: 'template',
      bodyType: 'text',
      channelCode: NotificationChannel.EMAIL,
    })
    await Promise.resolve()

    expect(result.current.rowRendered).toBeNull()
  })

  it('ignores a failure that lands after unmounting', async () => {
    let reject!: (reason: unknown) => void
    vi.mocked(previewTemplate).mockReturnValue(
      new Promise((_, r) => {
        reject = r
      }),
    )
    const { result, unmount } = renderHook(() => useTestSendRowPreview(rows, 'template'))
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled())

    unmount()
    reject(new Error('Too late'))
    await Promise.resolve()

    expect(result.current.isRowLoading).toBe(true)
  })

  it('renders nothing without rows or a template', () => {
    renderHook(() => useTestSendRowPreview(null, 'template'))

    expect(previewTemplate).not.toHaveBeenCalled()
  })
})
