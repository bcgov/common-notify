import { useState } from 'react'
import type { FC } from 'react'
import {
  Button,
  SvgChevronLeftIcon,
  SvgChevronRightIcon,
} from '@bcgov/design-system-react-components'
import EventEmailPreview from './EventEmailPreview'
import type { RenderedNotification } from './EventEmailPreview'
import EventEmailPreviewModal from './EventEmailPreviewModal'
import type { AppliedNotification } from './EventEmailPreviewModal'
import type { EventEmailSettings } from '@/api/events.api'
import type { TemplateResponse } from '@/api/templates.api'
import { rowRecipient } from '@/utils/bulkNotificationsCsv'
import type { ParsedCsv } from '@/utils/bulkNotificationsCsv'

interface TestSendReviewNotificationProps {
  emailSettings: EventEmailSettings
  template: TemplateResponse
  /** The one address a single recipient test goes to. */
  recipientEmail: string | null
  /** The uploaded rows once they are ready to send, or null when the test is not a CSV send. */
  readyRows: ParsedCsv | null
  /** Which uploaded row the review is showing, and that row rendered. */
  previewRow: number
  onPreviewRowChange: (row: number) => void
  rowRendered: RenderedNotification | null
  isRowLoading: boolean
  applied: AppliedNotification | null
  onApply: (applied: AppliedNotification) => void
}

const TestSendReviewNotification: FC<TestSendReviewNotificationProps> = ({
  emailSettings,
  template,
  recipientEmail,
  readyRows,
  previewRow,
  onPreviewRowChange,
  rowRendered,
  isRowLoading,
  applied,
  onApply,
}) => {
  const [isEditValuesOpen, setEditValuesOpen] = useState(false)
  const csvRowCount = readyRows?.rows.length ?? 0

  return (
    <>
      <div className="events__subsection">
        <h2 className="events__subheading">Review Notification</h2>
        <p className="events__help">
          Review the notification template and test data below before sending a test notification.
        </p>
      </div>

      <div className="events__test-send-review-bar">
        {/* Uploaded values come from the file and cannot be edited here, so a CSV send
            steps through its rows instead of offering Edit values. */}
        {readyRows ? (
          <>
            <span className="events__test-send-position" aria-live="polite">
              Email notification {previewRow + 1} of {csvRowCount}
            </span>
            <button
              type="button"
              className="events__test-send-nav"
              onClick={() => onPreviewRowChange(Math.max(0, previewRow - 1))}
              disabled={previewRow === 0 || isRowLoading}
              aria-label="Previous"
            >
              <SvgChevronLeftIcon />
            </button>
            <button
              type="button"
              className="events__test-send-nav"
              onClick={() => onPreviewRowChange(Math.min(csvRowCount - 1, previewRow + 1))}
              disabled={previewRow >= csvRowCount - 1 || isRowLoading}
              aria-label="Next"
            >
              <SvgChevronRightIcon />
            </button>
          </>
        ) : (
          <Button size="medium" variant="secondary" onPress={() => setEditValuesOpen(true)}>
            Edit values
          </Button>
        )}
      </div>

      <div className="events__preview-card">
        <EventEmailPreview
          emailSettings={emailSettings}
          template={template}
          envelope={{
            from: emailSettings.senderEmail ?? '',
            to: readyRows ? rowRecipient(readyRows, previewRow, 'email') : (recipientEmail ?? ''),
          }}
          rendered={readyRows ? (rowRendered ?? undefined) : applied?.rendered}
        />
      </div>

      {!readyRows && (
        <EventEmailPreviewModal
          isOpen={isEditValuesOpen}
          onClose={() => setEditValuesOpen(false)}
          template={template}
          emailSettings={emailSettings}
          from={emailSettings.senderEmail ?? ''}
          to={recipientEmail ?? ''}
          values={applied?.values ?? {}}
          onApply={(next) => {
            onApply(next)
            setEditValuesOpen(false)
          }}
        />
      )}
    </>
  )
}

export default TestSendReviewNotification
