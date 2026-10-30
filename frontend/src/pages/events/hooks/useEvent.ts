import { useEffect, useState } from 'react'
import { getEventById } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { useAppSelector } from '@/redux/hooks'

/**
 * Loads an event by ID for pages that are opened directly (by navigation or a refresh) and so
 * aren't handed the event. Refetches when the selected tenant changes.
 */
export function useEvent(eventId: string) {
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  const [event, setEvent] = useState<EventResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedTenantId) return

    let active = true

    getEventById(eventId)
      .then((loaded) => {
        if (active) {
          setEvent(loaded)
          setLoadError(null)
        }
      })
      .catch((error) => {
        if (active) {
          setEvent(null)
          setLoadError(error instanceof Error ? error.message : 'Failed to load event')
        }
      })

    return () => {
      active = false
    }
  }, [eventId, selectedTenantId])

  return { event, loadError }
}
