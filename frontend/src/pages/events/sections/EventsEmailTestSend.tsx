import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Callout,
  InlineAlert,
  Radio,
  RadioGroup,
  SvgChevronLeftIcon,
  SvgChevronRightIcon,
  TextField,
} from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import StickyBar from '@/components/StickyBar'
import UnsavedChanges from '@/components/UnsavedChanges'
import FileUpload from '@/components/FileUpload'
import EventEmailPreview from '../components/EventEmailPreview'
import type { RenderedNotification } from '../components/EventEmailPreview'
import EventEmailPreviewModal from '../components/EventEmailPreviewModal'
import type { AppliedNotification } from '../components/EventEmailPreviewModal'
// Lives with the batch send screen, the only other place a recipient CSV is uploaded.
import CsvIssuesTable from '@/pages/bulk-notifications/sections/CsvIssuesTable'
import { getEventById, sendEventTestEmail } from '@/api/events.api'
import type { EventEmailSettings, EventResponse } from '@/api/events.api'
import { getTemplateById, previewTemplate } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { useCsvUpload } from '@/hooks/useCsvUpload'
import type { CsvUpload } from '@/hooks/useCsvUpload'
import {
  buildSampleCsv,
  csvFilenameFor,
  downloadCsv,
  rowParams,
  rowRecipient,
  toMergeArray,
  MAX_FILE_BYTES,
} from '@/utils/bulkNotificationsCsv'
import type { ParsedCsv, RowIssue } from '@/utils/bulkNotificationsCsv'
import { useAppSelector } from '@/redux/hooks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import '@/scss/components/events.scss'

interface EventsEmailTestSendProps {
  eventId: string
}

type Recipient = 'myself' | 'other'
type AddRecipients = 'one' | 'many'

/**
 * Recipients one test send may reach, matching TEST_SEND_MAX_RECIPIENTS on the API.
 *
 * A longer file is trimmed to its first rows rather than rejected, which is what the tip above
 * the upload control promises.
 */
const MAX_TEST_RECIPIENTS = 5

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

function isValidEmail(value: string): boolean {
  return value.length <= 254 && !value.includes('..') && EMAIL_PATTERN.test(value)
}

/**
 * The one address a test goes to, or null on the paths that do not have one: both single
 * recipient paths end here, while a spreadsheet addresses its own rows instead. A typed address
 * is only checked when the test is sent.
 */
function recipientEmailFor(
  recipient: Recipient | null,
  isOneRecipient: boolean,
  userEmail: string | undefined,
  typedEmail: string,
): string | null {
  if (recipient === 'myself') return userEmail ?? null
  if (isOneRecipient) return typedEmail
  return null
}

/** Why a typed recipient address cannot be sent to, or '' when it can. */
function typedEmailErrorFor(email: string): string {
  if (email === '') return 'Enter an email address.'
  if (!isValidEmail(email)) return 'Enter a valid email address.'
  return ''
}

/**
 * The recipients a send names. Recipients are only sent when they were chosen; the API defaults
 * to the signed-in user.
 */
function testRecipientsFor(
  mergeRows: ParsedCsv | null,
  otherEmail: string | null,
): { to: string[] } | { mergeArray: string[][] } | undefined {
  if (mergeRows) return { mergeArray: toMergeArray(mergeRows, 'email') }
  if (otherEmail) return { to: [otherEmail] }
  return undefined
}

function showSendBlockedToast() {
  showErrorToast(
    'Unable to send test notification',
    'Complete all required fields before sending a test notification.',
  )
}

// The page is landed on from the saved page and on a refresh, so it fetches the event itself
// rather than being handed the settings it shows. Tenant-scoped, the same way the saved page is.
function useEvent(eventId: string) {
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

interface ReviewNotificationProps {
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

const ReviewNotification: FC<ReviewNotificationProps> = ({
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

interface CsvRecipientsUploadProps {
  csv: CsvUpload
  /** The upload cut down to the rows a test send reaches. */
  parsed: ParsedCsv | null
  /** Problems on the rows that were kept. */
  rowIssues: RowIssue[]
  isCsvReady: boolean
  missingFileError?: string
  onDownloadSample: () => void
  onFileChange: (file: File | null) => void
}

const CsvRecipientsUpload: FC<CsvRecipientsUploadProps> = ({
  csv,
  parsed,
  rowIssues,
  isCsvReady,
  missingFileError,
  onDownloadSample,
  onFileChange,
}) => (
  <>
    {/* The description only takes a string, so its paragraph break is a blank line
        the wrapper's styles keep. */}
    <div className="events__test-send-tip">
      <Callout
        variant="lightGrey"
        title="Tip"
        description={`Download the sample CSV to see the expected columns and format. Add the information needed for your template and upload the completed CSV below.\n\nOnly the first ${MAX_TEST_RECIPIENTS} recipients in the CSV will be processed.`}
      />
    </div>

    <div>
      <Button variant="secondary" onPress={onDownloadSample}>
        Download sample CSV
      </Button>
    </div>

    <FileUpload
      label="Upload CSV file"
      isRequired
      accept=".csv,text/csv"
      allowedExtensions={['.csv']}
      file={csv.file}
      onFileChange={onFileChange}
      maxSizeBytes={MAX_FILE_BYTES}
      progress={csv.readProgress}
      successMessage={csv.file && parsed ? 'File uploaded successfully' : undefined}
      errorMessage={csv.fileIssue ?? missingFileError}
      hint="Max file size: 5 MB"
    />

    <CsvIssuesTable issues={rowIssues} />

    {isCsvReady && (
      <InlineAlert
        variant="success"
        title="All required data passed validation."
        description="You can continue to the next step."
      />
    )}
  </>
)

interface TestSendFormProps {
  eventId: string
  emailSettings: EventEmailSettings
}

const TestSendForm: FC<TestSendFormProps> = ({ eventId, emailSettings }) => {
  const navigate = useNavigate()
  // Populated from the Keycloak token at startup, so this is the signed-in user's own address.
  const userEmail = useAppSelector((state) => state.auth.user?.email)
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
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
  // Which uploaded row the review is showing, and that row rendered.
  const [previewRow, setPreviewRow] = useState(0)
  const [rowRendered, setRowRendered] = useState<RenderedNotification | null>(null)
  const [isRowLoading, setRowLoading] = useState(false)

  const templateId = emailSettings.templateId

  // The template only supplies the preview below, so a failure leaves the preview empty rather
  // than putting the whole page into an error state.
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

  // The columns a file has to carry, as the API reports them rather than as the browser reads
  // them out of the template body - the same source the batch send screen uses.
  const placeholders = template?.placeholders?.paths ?? []
  const csv = useCsvUpload(placeholders, 'email')
  const { reset: resetCsv } = csv

  const isManyRecipients = recipient === 'other' && addRecipients === 'many'

  const isOneRecipient = recipient === 'other' && addRecipients === 'one'
  const typedEmail = otherEmail.trim()

  const recipientEmail = recipientEmailFor(recipient, isOneRecipient, userEmail, typedEmail)

  // The upload is read and checked in full, then cut down to the recipients a test send may
  // reach - which is what the tip above the upload control promises.
  const parsed = useMemo(
    () =>
      csv.parsed ? { ...csv.parsed, rows: csv.parsed.rows.slice(0, MAX_TEST_RECIPIENTS) } : null,
    [csv.parsed],
  )

  // Problems on the rows that were cut cannot be acted on, and would otherwise block a send that
  // never reaches them. Row numbers count the header as row 1, so the last one kept is the cap + 1.
  const rowIssues = csv.rowIssues.filter((issue) => issue.row <= MAX_TEST_RECIPIENTS + 1)

  const isCsvReady =
    isManyRecipients && parsed !== null && csv.fileIssue === null && rowIssues.length === 0
  const csvRowCount = parsed?.rows.length ?? 0
  // The rows a CSV send addresses, once they are ready to be sent and reviewed.
  const readyRows = isCsvReady ? parsed : null

  // Nothing checked against the previous choice still applies once the choice changes.
  const clearUpload = useCallback(() => {
    resetCsv()
    setSubmitAttempted(false)
    setPreviewRow(0)
    setRowRendered(null)
  }, [resetCsv])

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

  const handleDownloadSample = () => {
    if (!template) return
    downloadCsv(csvFilenameFor(template.name), buildSampleCsv(placeholders, 'email'))
    showSuccessToast(
      'Sample CSV downloaded.',
      'Complete the file and upload it to continue with the test send.',
    )
  }

  const handleFileChange = async (nextFile: File | null) => {
    setPreviewRow(0)
    setRowRendered(null)
    setSubmitAttempted(false)
    await csv.handleFileChange(nextFile)
  }

  // The one recipient path shows its preview before an address is typed, so it is reviewable as
  // soon as it is chosen.
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

      <div className="events__test-send-recipients">
        <RadioGroup
          label="Recipient(s)"
          isRequired
          description="Choose who will receive the test notification"
          isInvalid={Boolean(recipientError)}
          errorMessage={recipientError}
          value={recipient ?? ''}
          onChange={(value) => {
            setRecipient(value as Recipient)
            clearUpload()
          }}
        >
          <Radio value="myself">Myself</Radio>
          <Radio value="other">Another recipient</Radio>
        </RadioGroup>
      </div>

      {recipient === 'other' && (
        <>
          <RadioGroup
            label="Add recipient(s)"
            isRequired
            isInvalid={Boolean(addRecipientsError)}
            errorMessage={addRecipientsError}
            value={addRecipients ?? ''}
            onChange={(value) => {
              setAddRecipients(value as AddRecipients)
              clearUpload()
            }}
          >
            <Radio value="one">One recipient</Radio>
            <Radio value="many">Many recipients (upload a spreadsheet/CSV)</Radio>
          </RadioGroup>

          {addRecipients === 'one' && (
            <TextField
              label="Recipient email address"
              isRequired
              value={otherEmail}
              onChange={(value) => {
                setOtherEmail(value)
                // The error answers the last send attempt, not what is being typed now.
                setEmailError('')
              }}
              isInvalid={Boolean(emailError)}
              errorMessage={emailError}
              size="small"
            />
          )}
        </>
      )}

      {isManyRecipients && template && (
        <CsvRecipientsUpload
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
        <ReviewNotification
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

      {/* Before a recipient is picked the page is short enough that the action bar sits
          just under the radio group; this holds it down where it sits once the review
          below appears. */}
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

/**
 * Sends a test of the event's email notification, so its content and formatting can be checked
 * before the event is used for real.
 */
const EventsEmailTestSend: FC<EventsEmailTestSendProps> = ({ eventId }) => {
  const { event, loadError } = useEvent(eventId)

  let content: ReactNode
  if (loadError) {
    content = <div className="alert alert-danger">{loadError}</div>
  } else if (!event) {
    content = <p className="events__help">Loading event...</p>
  } else if (event.emailSettings) {
    content = <TestSendForm eventId={eventId} emailSettings={event.emailSettings} />
  } else {
    content = (
      <p className="events__help">This event has no saved email notification settings yet.</p>
    )
  }

  return (
    <div className="page events">
      <PageHeading
        title="Test Notification"
        breadcrumbs={[
          { label: 'Event', to: '/events' },
          { label: event?.name ?? 'Event' },
          { label: 'Test Notification' },
        ]}
      />

      <section className="events__section">{content}</section>
    </div>
  )
}

export default EventsEmailTestSend
