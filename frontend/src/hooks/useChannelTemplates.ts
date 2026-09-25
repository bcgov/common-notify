import { useEffect, useState } from 'react'
import { getTemplates } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'

/** Templates are listed a page at a time; this is the picker's ceiling, not a page size. */
const TEMPLATE_LIMIT = 100

/**
 * The tenant's active templates for one channel, for a template picker.
 *
 * Failures are deliberately not surfaced: the form around the picker is still usable without
 * the list, and the page reports its own save errors.
 */
export function useChannelTemplates(channelCode: string): TemplateResponse[] {
  const [templates, setTemplates] = useState<TemplateResponse[]>([])

  useEffect(() => {
    let active = true

    getTemplates(1, TEMPLATE_LIMIT, undefined, 'name', [`channelCode:eq:${channelCode}`])
      .then((response) => {
        if (active) {
          setTemplates(response.data)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [channelCode])

  return templates
}
