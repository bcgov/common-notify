import { useCallback, useEffect, useRef, useState } from 'react'

interface PollingState<T> {
  data: T | null
  error: string | null
  /** True only until the first response (or error) arrives. */
  isLoading: boolean
  isRefreshing: boolean
  refresh: () => void
}

interface PollingOptions {
  intervalMs: number
  /** Stop the timer but keep the data; `refresh()` still works. */
  paused?: boolean
  /** Make no requests at all, e.g. while the user lacks the role the endpoint needs. */
  skip?: boolean
}

/**
 * Fetch `fetcher` on mount and then every `intervalMs`, skipping ticks while the tab is
 * hidden. The last good data is kept when a refresh fails, so a single failed poll shows an
 * error without blanking the screen. Pass a stable `fetcher` (a module function, or one
 * wrapped in useCallback) or every render restarts the timer.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  { intervalMs, paused = false, skip = false }: PollingOptions,
): PollingState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setIsRefreshing(true)
    try {
      setData(await fetcher())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      inFlight.current = false
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [fetcher])

  useEffect(() => {
    if (!skip) void load()
  }, [skip, load])

  useEffect(() => {
    if (skip || paused) return
    const id = window.setInterval(() => {
      if (!document.hidden) void load()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [skip, paused, intervalMs, load])

  return { data, error, isLoading, isRefreshing, refresh: load }
}
