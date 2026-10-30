import { useCallback, useEffect, useState } from 'react'
import { previewTemplate } from '@/api/templates.api'
import { rowParams } from '@/utils/bulkNotificationsCsv'
import type { ParsedCsv } from '@/utils/bulkNotificationsCsv'
import type { RenderedNotification } from '../components/EventsEmailPreview'

/** Which uploaded row the review is showing, and that row rendered. */
export function useTestSendRowPreview(readyRows: ParsedCsv | null, templateId: string | null) {
  const [previewRow, setPreviewRow] = useState(0)
  const [rowRendered, setRowRendered] = useState<RenderedNotification | null>(null)
  const [isRowLoading, setRowLoading] = useState(false)

  // Render the row the review is showing. The subject line is where a missing value hides, so
  // each row is rendered by the API rather than shown as the raw template.
  useEffect(() => {
    if (!readyRows || !templateId) return

    let active = true
    setRowLoading(true)

    previewTemplate(templateId, rowParams(readyRows, previewRow, 'email'))
      .then((response) => {
        if (!active) return
        setRowRendered({
          subject: response.subject ?? '',
          bodyHtml: response.html,
          bodyText: response.body,
        })
      })
      .catch(() => {
        if (active) setRowRendered(null)
      })
      .finally(() => {
        if (active) setRowLoading(false)
      })

    return () => {
      active = false
    }
  }, [readyRows, previewRow, templateId])

  // Back to the first row, with nothing rendered, for when the rows themselves change.
  const resetPreview = useCallback(() => {
    setPreviewRow(0)
    setRowRendered(null)
  }, [])

  return { previewRow, setPreviewRow, rowRendered, isRowLoading, resetPreview }
}
