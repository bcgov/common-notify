import { useCallback, useEffect, useRef, useState } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { useLiveUpdates } from '@/hooks/useLiveUpdates'
import type { LiveStatus } from '@/hooks/useLiveUpdates'
import { connectQueueMonitoringStream, getQueueMonitoring } from '@/api/monitoring.api'
import type { HealthStatus, QueueMonitoring } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS } from '@/utils/monitoring'

/** Polled while the live stream is up: catches time-based changes (ages, stale heartbeats). */
export const BACKSTOP_INTERVAL_MS = 60_000
/** Polled while the stream is down or refused. */
export const FALLBACK_INTERVAL_MS = 15_000

export interface MonitoringSnapshot {
  data: QueueMonitoring | null
  error: string | null
  isLoading: boolean
  isRefreshing: boolean
  refresh: () => void
  liveStatus: LiveStatus
  liveUpdates: boolean
  setLiveUpdates: (on: boolean) => void
  /** Text for a polite live region: set when overall health changes, not on every refresh. */
  announcement: string
}

/**
 * The monitoring snapshot every admin monitoring page reads: fetched on mount, refetched
 * whenever the server's live stream says something changed, and polled as a backstop.
 * Each page mounts its own, so moving between pages costs one request, not a stream per tab.
 */
export function useMonitoringSnapshot(enabled: boolean): MonitoringSnapshot {
  const [liveUpdates, setLiveUpdates] = useState(true)

  // The stream only says "something changed"; the snapshot still comes from the endpoint.
  const refreshRef = useRef<() => void>(() => {})
  const onChange = useCallback(() => {
    refreshRef.current()
  }, [])
  const liveStatus = useLiveUpdates(connectQueueMonitoringStream, enabled && liveUpdates, onChange)

  const { data, error, isLoading, isRefreshing, refresh } = usePolling(getQueueMonitoring, {
    intervalMs: liveStatus === 'live' ? BACKSTOP_INTERVAL_MS : FALLBACK_INTERVAL_MS,
    paused: !liveUpdates,
    skip: !enabled,
  })
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  const [announcement, setAnnouncement] = useState('')
  const [announcedStatus, setAnnouncedStatus] = useState<HealthStatus | null>(null)
  if (data && data.status !== announcedStatus) {
    if (announcedStatus !== null) {
      setAnnouncement(`Overall health changed to ${HEALTH_LABELS[data.status]}`)
    }
    setAnnouncedStatus(data.status)
  }

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refresh,
    liveStatus,
    liveUpdates,
    setLiveUpdates,
    announcement,
  }
}
