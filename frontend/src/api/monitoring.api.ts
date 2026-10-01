import type { AxiosError } from 'axios'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { QueueMonitoring } from '@/interfaces/queueMonitoring.interface'

/**
 * Queue, worker and Redis health for the admin monitoring page. Requires NOTIFY_ADMIN.
 * Polled by the page itself; nothing else reads it, so it does not go through a slice.
 */
export async function getQueueMonitoring(): Promise<QueueMonitoring> {
  try {
    const params = generateApiParameters('/api/v1/frontend/admin/monitoring/queues')
    return await get<QueueMonitoring>(params)
  } catch (error) {
    const status = (error as AxiosError).response?.status
    if (status === STATUS_CODES.Unauthorized || status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to view queue monitoring')
    }
    const message = ((error as AxiosError).response?.data as { message?: string } | undefined)
      ?.message
    throw new Error(
      `Failed to load queue monitoring: ${message || (error instanceof Error ? error.message : 'Unknown error')}`,
    )
  }
}
