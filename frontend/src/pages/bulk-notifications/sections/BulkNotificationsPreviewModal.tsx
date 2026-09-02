import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { previewTemplate } from '@/api/templates.api'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import type { PreviewVariable } from '@/components/NotificationPreviewModal'
import { rowParams, rowRecipient, RECIPIENT_COLUMN } from '@/utils/bulkNotificationsCsv'
import type { ParsedCsv } from '@/utils/bulkNotificationsCsv'

interface BulkNotificationsPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  templateId: string
  parsed: ParsedCsv
  isSending?: boolean
  onSend: () => void
}

/**
 * Shows one recipient's email exactly as it will be sent, with that row's values substituted.
 *
 * Stepping through rows is the point: a bulk send is only as good as its worst row, and the subject
 * line is where a missing value is easiest to miss. Values are read-only here - they come from the
 * spreadsheet, and editing them would preview something that will not be sent.
 */
const BulkNotificationsPreviewModal: FC<BulkNotificationsPreviewModalProps> = ({
  isOpen,
  onClose,
  templateId,
  parsed,
  isSending = false,
  onSend,
}) => {
  const rowCount = parsed.rows.length
  const [rowIndex, setRowIndex] = useState(0)
  const [subject, setSubject] = useState('')
  const [fromAddress, setFromAddress] = useState<string | undefined>()
  const [bodyHtml, setBodyHtml] = useState<string | undefined>()
  const [bodyText, setBodyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const renderRow = useCallback(
    async (index: number) => {
      setLoading(true)
      setError(null)
      try {
        const response = await previewTemplate(templateId, rowParams(parsed, index))
        setSubject(response.subject ?? '')
        setFromAddress(response.from)
        setBodyHtml(response.html)
        setBodyText(response.body)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to render this row')
        setBodyHtml(undefined)
        setBodyText('')
      } finally {
        setLoading(false)
      }
    },
    [parsed, templateId],
  )

  // Re-render on open and whenever the row changes; a closed modal renders nothing.
  useEffect(() => {
    if (!isOpen) return
    void renderRow(rowIndex)
  }, [isOpen, rowIndex, renderRow])

  // Start each visit at the first recipient rather than wherever the last visit ended.
  useEffect(() => {
    if (isOpen) setRowIndex(0)
  }, [isOpen])

  // The spreadsheet's own values, in its column order, so the list matches the file being sent.
  const variables: PreviewVariable[] = parsed.headers
    .map((header, column) => {
      const value = parsed.rows[rowIndex]?.[column] ?? ''
      // The API's placeholder report lists paths, not types, so a boolean is recognised by its
      // value. Only cosmetic: these fields are read-only, and the value is sent either way.
      const isBoolean = /^(true|false)$/i.test(value.trim())

      return {
        name: header,
        value: isBoolean ? value.trim().toLowerCase() : value,
        type: (isBoolean ? 'boolean' : 'text') as 'boolean' | 'text',
      }
    })
    .filter((variable) => variable.name !== RECIPIENT_COLUMN)

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Notifications Preview"
      variables={variables}
      variablesIntro="These values come from your CSV file."
      stepper={{
        label: `Email notification ${rowIndex + 1} of ${rowCount}`,
        onPrevious: () => setRowIndex((index) => Math.max(0, index - 1)),
        onNext: () => setRowIndex((index) => Math.min(rowCount - 1, index + 1)),
        hasPrevious: rowIndex > 0 && !loading,
        hasNext: rowIndex < rowCount - 1 && !loading,
      }}
      from={fromAddress}
      to={rowRecipient(parsed, rowIndex)}
      subject={subject}
      bodyHtml={bodyHtml}
      bodyText={bodyText}
      isLoading={loading}
      error={error}
      footer={
        <Button variant="primary" onPress={onSend} isDisabled={isSending}>
          {isSending ? 'Sending...' : `Send notification (${rowCount})`}
        </Button>
      }
    />
  )
}

export default BulkNotificationsPreviewModal
