import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BulkNotificationsValidationError, sendBulkNotifications } from './bulkNotifications.api'
import { post } from '@/common/api'

vi.mock('@/common/api', () => ({
  post: vi.fn(),
  generateApiParameters: vi.fn((url: string) => ({ url, requiresAuthentication: true })),
  STATUS_CODES: { BadRequest: 400, Forbidden: 403 },
}))

const httpError = (status: number, data?: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  })

const mergeArray = [
  ['to', 'firstName'],
  ['jane@example.com', 'Jane'],
]

describe('bulkNotifications.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(post).mockResolvedValue({ notifyId: 'n1', status: 'accepted' })
  })

  it('sends email as a bare channel body on the frontend notify route', async () => {
    await sendBulkNotifications('t1', mergeArray)

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/frontend/notifysimple',
        data: { content: { templateId: 't1' }, recipients: { mergeArray } },
      }),
    )
  })

  it('sends SMS as a full request on the sms route', async () => {
    await sendBulkNotifications('t1', mergeArray, 'sms')

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/frontend/notifysimple/sms',
        data: { sms: { content: { templateId: 't1' }, recipients: { mergeArray } } },
      }),
    )
  })

  it('raises row-level validation failures as their own error type', async () => {
    vi.mocked(post).mockRejectedValue(
      httpError(422, {
        message: 'Request validation failed',
        errors: ['Row 2: "x" is not a valid email address'],
      }),
    )

    await expect(sendBulkNotifications('t1', mergeArray)).rejects.toBeInstanceOf(
      BulkNotificationsValidationError,
    )
    await expect(sendBulkNotifications('t1', mergeArray)).rejects.toMatchObject({
      message: 'Request validation failed',
      errors: ['Row 2: "x" is not a valid email address'],
    })
  })

  it('names the rows even when the response carries no summary message', async () => {
    vi.mocked(post).mockRejectedValue(httpError(422, { errors: ['Row 2: bad address'] }))

    await expect(sendBulkNotifications('t1', mergeArray)).rejects.toThrow(
      'Request validation failed',
    )
  })

  it('explains a 403', async () => {
    vi.mocked(post).mockRejectedValue(httpError(403, {}))

    await expect(sendBulkNotifications('t1', mergeArray)).rejects.toThrow(
      'You do not have permission to send notifications for this tenant',
    )
  })

  it('explains hitting the notification limit', async () => {
    vi.mocked(post).mockRejectedValue(httpError(429, {}))

    await expect(sendBulkNotifications('t1', mergeArray)).rejects.toThrow(
      'This send would go over your notification limit',
    )
  })

  it("surfaces the server's message for any other failure", async () => {
    vi.mocked(post).mockRejectedValue(httpError(500, { message: 'queue unavailable' }))

    await expect(sendBulkNotifications('t1', mergeArray)).rejects.toThrow(
      'Failed to send notifications: queue unavailable',
    )
  })

  it('falls back to the thrown error when there is no response body', async () => {
    vi.mocked(post).mockRejectedValue(new Error('Network Error'))

    await expect(sendBulkNotifications('t1', mergeArray)).rejects.toThrow(
      'Failed to send notifications: Network Error',
    )
  })
})
