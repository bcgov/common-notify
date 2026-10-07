import { useState } from 'react'
import type { FC } from 'react'
import { InlineAlert } from '@bcgov/design-system-react-components'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import type { EventEmailSettings } from '@/api/events.api'
import { rowRecipient, rowVariables } from '@/utils/bulkNotificationsCsv'
import type { ParsedCsv } from '@/utils/bulkNotificationsCsv'
import EventEmailHeader from './EventEmailHeader'
import type { RenderedNotification } from './EventEmailPreview'

interface EventEmailCsvPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  emailSettings: EventEmailSettings
  /** The uploaded rows, already cut down to the recipients one test send may reach. */
  parsed: ParsedCsv
  rowIndex: number
  onRowChange: (index: number) => void
  /** The sender the event is configured to send from. */
  from: string
  /** The row rendered by the page, so the modal and the page below it never disagree. */
  rendered: RenderedNotification | null
  isLoading: boolean
}

/**
 * One uploaded row shown as the email it will produce: the envelope and header the event sends
 * under, and that row's own values beside them.
 *
 * Read-only, unlike the single-recipient modal this sits next to. The values come from the
 * spreadsheet, so editing them here would preview something that will not be sent - the file is
 * the thing to change. Stepping is the point instead: a test send is only as good as its worst
 * row, and the subject line is where a missing value is easiest to miss.
 */
const EventEmailCsvPreviewModal: FC<EventEmailCsvPreviewModalProps> = ({
  isOpen,
  onClose,
  emailSettings,
  parsed,
  rowIndex,
  onRowChange,
  from,
  rendered,
  isLoading,
}) => {
  const [isNoticeVisible, setNoticeVisible] = useState(true)
  const rowCount = parsed.rows.length

  // Dismissing the notice applies to the visit rather than to the session, so it comes back for
  // the next one. Restored on the way out: the shell routes every close through here, including
  // Escape and a click outside.
  const handleClose = () => {
    setNoticeVisible(true)
    onClose()
  }

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Notification Values"
      notice={
        isNoticeVisible ? (
          <InlineAlert
            variant="info"
            description="Preview values are generated from your uploaded CSV file."
            isCloseable
            onClose={() => setNoticeVisible(false)}
          />
        ) : undefined
      }
      variables={rowVariables(parsed, rowIndex, 'email')}
      variablesHeading="Notification values"
      variablesIntro="These values come from your CSV file. Upload a corrected file to change them."
      stepper={{
        label: `Email notification ${rowIndex + 1} of ${rowCount}`,
        onPrevious: () => onRowChange(Math.max(0, rowIndex - 1)),
        onNext: () => onRowChange(Math.min(rowCount - 1, rowIndex + 1)),
        hasPrevious: rowIndex > 0 && !isLoading,
        hasNext: rowIndex < rowCount - 1 && !isLoading,
      }}
      from={from || undefined}
      to={rowRecipient(parsed, rowIndex, 'email')}
      subject={rendered?.subject}
      // The header is the event's own, not part of the rendered body, so it sits above it the way
      // the preview card on the page shows it.
      outputHeader={<EventEmailHeader emailSettings={emailSettings} />}
      bodyHtml={rendered?.bodyHtml}
      bodyText={rendered?.bodyText ?? ''}
      isLoading={isLoading}
    />
  )
}

export default EventEmailCsvPreviewModal
