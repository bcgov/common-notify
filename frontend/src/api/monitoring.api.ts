import type { AxiosError } from 'axios'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { QueueMonitoring } from '@/interfaces/queueMonitoring.interface'
import UserService from '@/service/user-service'

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

export interface QueueMonitoringStreamHandlers {
  onOpen: () => void
  /** Queue state changed; refetch the snapshot. */
  onChange: () => void
  /** The stream dropped. `fatal` means it was refused and will not retry. */
  onError: (fatal: boolean) => void
}

/** A refusal retrying cannot fix, such as 401 or 403. Thrown to stop fetch-event-source. */
class StreamRefusedError extends Error {}

/**
 * Open the monitoring change stream. It carries no data, only `changed` signals (at most every
 * 2s) and keepalives, so the page refetches the snapshot when something moves. Closes while the
 * tab is hidden and reconnects when it is shown. Call abort() on the result to close it.
 */
export function connectQueueMonitoringStream(handlers: QueueMonitoringStreamHandlers) {
  const controller = new AbortController()
  const url = generateApiParameters('/api/v1/frontend/admin/monitoring/queues/events').url

  const fetchWithFreshToken = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await UserService.getToken()
    return fetch(input, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    })
  }

  fetchEventSource(url, {
    fetch: fetchWithFreshToken,
    signal: controller.signal,
    async onopen(response) {
      if (response.status === 401 || response.status === 403) {
        throw new StreamRefusedError(`Monitoring stream refused with ${response.status}`)
      }
      if (!response.ok) throw new Error(`Monitoring stream failed with ${response.status}`)
      handlers.onOpen()
    },
    onmessage(event: EventSourceMessage) {
      if (event.event === 'changed') handlers.onChange()
    },
    onerror(error: unknown) {
      const fatal = error instanceof StreamRefusedError
      handlers.onError(fatal)
      // Throwing stops the retry loop; returning lets it reconnect with backoff.
      if (fatal) throw error
    },
  }).catch(() => {
    // Rejects only after a fatal error, which onError has already reported.
  })

  return controller
}
