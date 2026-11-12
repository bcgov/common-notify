import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, InlineAlert } from '@bcgov/design-system-react-components'
import { previewTemplate } from '@/api/templates.api'
import EmailBodyFrame from '@/components/EmailBodyFrame'
import EmailHeader from '@/components/EmailHeader'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import SmsPreview from '@/components/SmsPreview'
import { rowParams, rowRecipient, rowVariables } from '@/utils/bulkNotificationsCsv'
import type { BulkChannel, ParsedCsv } from '@/utils/bulkNotificationsCsv'

interface BulkNotificationsPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  templateId: string
  parsed: ParsedCsv
  channel: BulkChannel
  isSending?: boolean
  onSend: () => void
}

// A batch send has no event to override the header, so it goes out under the tenant's.
const TENANT_HEADER = { useCustomHeader: false, headerLogoId: null, headerTitle: null }

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
  channel,
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
  const [isNoticeDismissed, setNoticeDismissed] = useState(false)

  const renderRow = useCallback(
    async (index: number) => {
      setLoading(true)
      setError(null)
      try {
        const response = await previewTemplate(templateId, rowParams(parsed, index, channel))
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
    [parsed, templateId, channel],
  )

  // Re-render on open and whenever the row changes; a closed modal renders nothing.
  useEffect(() => {
    if (!isOpen) return
    void renderRow(rowIndex)
  }, [isOpen, rowIndex, renderRow])

  // Start each visit at the first recipient rather than wherever the last visit ended.
  useEffect(() => {
    if (isOpen) {
      setRowIndex(0)
      setNoticeDismissed(false)
    }
  }, [isOpen])

  // A blank cell is never read as a boolean, so anything empty here is a text value.
  const variables = rowVariables(parsed, rowIndex, channel).map((variable) => ({
    ...variable,
    isInvalid: !variable.value,
    errorMessage: 'This field is empty.',
  }))
  // The banner speaks for the whole send, so any row with a blank shows it, whichever is on screen.
  const hasEmptyField = useMemo(
    () =>
      parsed.rows.some((_, index) =>
        rowVariables(parsed, index, channel).some((variable) => !variable.value),
      ),
    [parsed, channel],
  )
  const isEmail = channel === 'email'

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Batch Notification Preview"
      notice={
        hasEmptyField && !isNoticeDismissed ? (
          <InlineAlert
            variant="warning"
            description="Some fields are empty. You can still send notifications, but recipients may receive messages with missing information. To avoid this, update your CSV file and upload the revised version before sending."
            isCloseable
            onClose={() => setNoticeDismissed(true)}
          />
        ) : undefined
      }
      variables={variables}
      variablesIntro="Provide values for all variables in your template."
      stepper={{
        label: `${channel === 'sms' ? 'SMS' : 'Email'} notification ${rowIndex + 1} of ${rowCount}`,
        onPrevious: () => setRowIndex((index) => Math.max(0, index - 1)),
        onNext: () => setRowIndex((index) => Math.min(rowCount - 1, index + 1)),
        hasPrevious: rowIndex > 0 && !loading,
        hasNext: rowIndex < rowCount - 1 && !loading,
      }}
      from={fromAddress}
      to={rowRecipient(parsed, rowIndex, channel)}
      subject={subject}
      outputHeader={isEmail ? <EmailHeader emailSettings={TENANT_HEADER} /> : undefined}
      // The same frame as the event previews. Only once a render has succeeded, so the modal's own
      // loading and error states still show.
      bodyOverride={
        isEmail && !loading && !error && bodyHtml !== undefined ? (
          <EmailBodyFrame html={bodyHtml} />
        ) : undefined
      }
      bodyHtml={bodyHtml}
      bodyText={bodyText}
      smsPreview={channel === 'sms' ? <SmsPreview body={bodyText} showParts /> : undefined}
      isLoading={loading}
      error={error}
      footer={
        <Button variant="primary" onPress={onSend} isDisabled={isSending || loading || !!error}>
          {isSending ? 'Sending...' : `Send notification (${rowCount})`}
        </Button>
      }
    />
  )
}

export default BulkNotificationsPreviewModal
