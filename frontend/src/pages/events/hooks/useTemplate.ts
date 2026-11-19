import { useEffect, useState } from 'react'
import { getTemplateById } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'

/**
 * The event's template, or null until it loads. The template only supplies a preview, so a
 * failure leaves the preview empty rather than putting the whole page into an error state.
 */
export function useTemplate(templateId: string | null) {
  const [template, setTemplate] = useState<TemplateResponse | null>(null)

  useEffect(() => {
    if (!templateId) return
    let active = true

    getTemplateById(templateId)
      .then((loaded) => {
        if (active) setTemplate(loaded)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [templateId])

  return template
}
