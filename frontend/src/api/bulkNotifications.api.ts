import type { AxiosError } from 'axios'
import { post, generateApiParameters, STATUS_CODES } from '@/common/api'

/**
 * Bulk notification send from an uploaded recipient list.
 *
 * Posts to the frontend notify route rather than `/api/v1/notifysimple`, which is service-to-service
 * and authenticates with an API key. `notify.api.ts` targets that one and is unused.
 */

export interface BulkNotificationsSendResponse {
  notifyId: string
  templateId?: string
  status: string
  channels: string[]
  createdAt: string
  message: string
  /** Recipients accepted for sending, after any safelist filtering. */
  recipientCount?: number
  /** Present only when the tenant safelist dropped recipients (non-production environments). */
  blockedRecipientCount?: number
  blockedMessage?: string
}

/** Validation failures the API reports per row, e.g. `Row 3: "x" is not a valid email address`. */
export class BulkNotificationsValidationError extends Error {
  readonly errors: string[]

  constructor(message: string, errors: string[]) {
    super(message)
    this.name = 'BulkNotificationsValidationError'
    this.errors = errors
  }
}

/**
 * Send one email per row of `mergeArray`.
 *
 * The first row is the header, whose first column is `to`; the remaining columns become that
 * recipient's template values.
 */
export async function sendBulkNotifications(
  templateId: string,
  mergeArray: string[][],
): Promise<BulkNotificationsSendResponse> {
  try {
    const apiParams = generateApiParameters('/api/v1/frontend/notifysimple')
    return await post<BulkNotificationsSendResponse>({
      ...apiParams,
      data: {
        content: { templateId },
        recipients: { mergeArray },
      },
    })
  } catch (error) {
    const axiosError = error as AxiosError
    const status = axiosError.response?.status
    const data = (axiosError.response?.data ?? {}) as { message?: string; errors?: string[] }

    // 422 is row-level merge validation; 400 covers a request the safelist rejected outright.
    if (data.errors?.length) {
      throw new BulkNotificationsValidationError(
        data.message || 'Request validation failed',
        data.errors,
      )
    }
    if (status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to send notifications for this tenant')
    }
    if (status === 429) {
      throw new Error('This send would go over your notification limit')
    }

    throw new Error(
      `Failed to send notifications: ${
        data.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}
