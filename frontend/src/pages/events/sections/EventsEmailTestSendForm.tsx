import { useCallback, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, Callout } from '@bcgov/design-system-react-components'
import StickyBar from '@/components/StickyBar'
import UnsavedChanges from '@/components/UnsavedChanges'
import type { AppliedNotification } from '../components/EventsTestSendPreviewModal'
import EventsTestSendCsvUpload from '../components/EventsTestSendCsvUpload'
import EventsTestSendRecipientFields from '../components/EventsTestSendRecipientFields'
import EventsTestSendReviewNotification from '../components/EventsTestSendReviewNotification'
import { useTemplate } from '../hooks/useTemplate'
import { useTestSendRowPreview } from '../hooks/useTestSendRowPreview'
import {
  MAX_TEST_RECIPIENTS,
  recipientEmailFor,
  showSendBlockedToast,
  testRecipientsFor,
  typedEmailErrorFor,
} from '../utils/testSend'
import type { AddRecipients, Recipient } from '../utils/testSend'
import { sendEventTestEmail } from '@/api/events.api'
import type { EventEmailSettings } from '@/api/events.api'
import { useCsvUpload } from '@/hooks/useCsvUpload'
import { buildSampleCsv, csvFilenameFor, downloadCsv } from '@/utils/bulkNotificationsCsv'
import { useAppSelector } from '@/redux/hooks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

interface EventsEmailTestSendFormProps {
  eventId: string
  emailSettings: EventEmailSettings
}

const EventsEmailTestSendForm: FC<EventsEmailTestSendFormProps> = ({ eventId, emailSettings }) => {
  const navigate = useNavigate()
  // Populated from the Keycloak token at startup, so this is the signed-in user's own address.
  const userEmail = useAppSelector((state) => state.auth.user?.email)
  // Nothing is selected to begin with, so the review below only appears once a choice is made.
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [addRecipients, setAddRecipients] = useState<AddRecipients | null>(null)
  const [otherEmail, setOtherEmail] = useState('')
  // Set when a send is attempted, so the field is not checked while it is being typed in.
  const [emailError, setEmailError] = useState('')
  // Send is always pressable, so the choices it still needs are only flagged once it has been.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  // The values the test will be sent with, and the notification they render to. Held here rather
  // than in the modal so they outlive it: the preview below shows the render, and the values are
  // ready for the send once there is an endpoint to send through.
  const [applied, setApplied] = useState<AppliedNotification | null>(null)
  const [isSending, setSending] = useState(false)

  const templateId = emailSettings.templateId
  const template = useTemplate(templateId)

  // The columns a file has to carry
  const placeholders = template?.placeholders?.paths ?? []
  const csv = useCsvUpload(placeholders, 'email')
  const { reset: resetCsv } = csv

  const isManyRecipients = recipient === 'other' && addRecipients === 'many'

  const isOneRecipient = recipient === 'other' && addRecipients === 'one'
  const typedEmail = otherEmail.trim()

  const recipientEmail = recipientEmailFor(recipient, isOneRecipient, userEmail, typedEmail)

  // The upload is read and checked in full, then cut down to a max of 5 recipients.
  const parsed = useMemo(
    () =>
      csv.parsed ? { ...csv.parsed, rows: csv.parsed.rows.slice(0, MAX_TEST_RECIPIENTS) } : null,
    [csv.parsed],
  )

  // Filter out issues on rows that are not being sent to.
  const rowIssues = csv.rowIssues.filter((issue) => issue.row <= MAX_TEST_RECIPIENTS + 1)

  const isCsvReady =
    isManyRecipients && parsed !== null && csv.fileIssue === null && rowIssues.length === 0
  const csvRowCount = parsed?.rows.length ?? 0
  // The rows a CSV send addresses, once they are ready to be sent and reviewed.
  const readyRows = isCsvReady ? parsed : null

  const { previewRow, setPreviewRow, rowRendered, isRowLoading, resetPreview } =
    useTestSendRowPreview(readyRows, templateId)

  const clearUpload = useCallback(() => {
    resetCsv()
    setSubmitAttempted(false)
    resetPreview()
  }, [resetCsv, resetPreview])

  const handleDownloadSample = () => {
    if (!template) return
    downloadCsv(csvFilenameFor(template.name), buildSampleCsv(placeholders, 'email'))
    showSuccessToast(
      'Sample CSV downloaded.',
      'Complete the file and upload it to continue with the test send.',
    )
  }

  const handleFileChange = async (nextFile: File | null) => {
    resetPreview()
    setSubmitAttempted(false)
    await csv.handleFileChange(nextFile)
  }

  const isReviewable =
    Boolean(template) && (Boolean(recipientEmail) || isOneRecipient || isCsvReady)
  const recipientCount = isManyRecipients ? csvRowCount : 1

  // Anything chosen, typed, uploaded or applied here is lost on leaving.
  const hasUnsavedChanges =
    recipient !== null || otherEmail !== '' || csv.file !== null || applied !== null

  const isMissingRecipients = recipient === 'other' && !addRecipients
  const isCsvInvalid =
    isManyRecipients && (!csv.file || csv.fileIssue !== null || rowIssues.length > 0)

  const recipientError = submitAttempted && !recipient ? 'Select a recipient.' : undefined
  const addRecipientsError =
    submitAttempted && isMissingRecipients ? 'Choose how to add recipients.' : undefined
  const missingFileError =
    submitAttempted && isManyRecipients && !csv.file
      ? 'A CSV file is required to continue.'
      : undefined

  const handleSend = async () => {
    setSubmitAttempted(true)

    const typedEmailError = isOneRecipient ? typedEmailErrorFor(typedEmail) : ''
    setEmailError(typedEmailError)

    // Each problem is flagged where it is - the field, the upload control or the issues table -
    // and the toast says why nothing was sent.
    if (!recipient || isMissingRecipients || isCsvInvalid || typedEmailError) {
      showSendBlockedToast()
      return
    }

    // A file still being read is neither ready nor at fault yet.
    if (isManyRecipients && !isCsvReady) return

    setSending(true)
    try {
      // The values the preview was rendered from, so what arrives is what was reviewed. Sending
      // none is allowed: the API answers with the placeholders the template still needs.
      await sendEventTestEmail(
        eventId,
        applied?.params ?? {},
        testRecipientsFor(readyRows, recipient === 'other' ? recipientEmail : null),
      )
      showSuccessToast('Test notification queued.')
    } catch (error) {
      // The API's reason - missing values, an inactive event, a recipient it will not send to -
      // already worded for the user by the events API.
      showErrorToast(
        'Unable to send test notification',
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <UnsavedChanges
        hasUnsavedChanges={hasUnsavedChanges}
        modalTitle="Leave test send?"
        modalMessage="The recipients and/or test values you've entered will be lost if you leave this page."
        primaryButtonText="Leave page"
      />

      <Callout
        variant="lightBlue"
        title="Limited recipients."
        description="You can only send notifications to team members."
      />

      <EventsTestSendRecipientFields
        recipient={recipient}
        onRecipientChange={(value) => {
          setRecipient(value)
          clearUpload()
        }}
        addRecipients={addRecipients}
        onAddRecipientsChange={(value) => {
          setAddRecipients(value)
          clearUpload()
        }}
        otherEmail={otherEmail}
        onOtherEmailChange={(value) => {
          setOtherEmail(value)
          // The error answers the last send attempt, not what is being typed now.
          setEmailError('')
        }}
        recipientError={recipientError}
        addRecipientsError={addRecipientsError}
        emailError={emailError}
      />

      {isManyRecipients && template && (
        <EventsTestSendCsvUpload
          csv={csv}
          parsed={parsed}
          rowIssues={rowIssues}
          isCsvReady={isCsvReady}
          missingFileError={missingFileError}
          onDownloadSample={handleDownloadSample}
          onFileChange={(nextFile) => void handleFileChange(nextFile)}
        />
      )}

      {isReviewable && template && (
        <EventsTestSendReviewNotification
          emailSettings={emailSettings}
          template={template}
          recipientEmail={recipientEmail}
          readyRows={readyRows}
          previewRow={previewRow}
          onPreviewRowChange={setPreviewRow}
          rowRendered={rowRendered}
          isRowLoading={isRowLoading}
          applied={applied}
          onApply={setApplied}
        />
      )}

      {!isReviewable && <div className="events__test-send-spacer" aria-hidden />}

      <StickyBar>
        <Button
          variant="secondary"
          type="button"
          onPress={() =>
            navigate({
              to: '/events/$eventId',
              params: { eventId },
              search: { tab: 'email' },
            })
          }
        >
          Back to email notifications
        </Button>
        <Button
          variant="primary"
          type="button"
          onPress={() => void handleSend()}
          isDisabled={isSending}
        >
          {isSending ? 'Sending...' : `Send test email (${recipientCount})`}
        </Button>
      </StickyBar>
    </>
  )
}

export default EventsEmailTestSendForm
