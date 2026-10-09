import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
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
import FileUpload from '@/components/FileUpload'
import EventEmailPreview from '../components/EventEmailPreview'
import type { RenderedNotification } from '../components/EventEmailPreview'
import EventEmailPreviewModal from '../components/EventEmailPreviewModal'
import type { AppliedNotification } from '../components/EventEmailPreviewModal'
// Lives with the batch send screen, the only other place a recipient CSV is uploaded.
import CsvIssuesTable from '@/pages/bulk-notifications/sections/CsvIssuesTable'
import { getEventById, sendEventTestEmail } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { getTemplateById, previewTemplate } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { useCsvUpload } from '@/hooks/useCsvUpload'
import {
  buildSampleCsv,
  csvFilenameFor,
  downloadCsv,
  rowParams,
  rowRecipient,
  toMergeArray,
  MAX_FILE_BYTES,
} from '@/utils/bulkNotificationsCsv'
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
 * Sends a test of the event's email notification, so its content and formatting can be checked
 * before the event is used for real.
 */
const EventsEmailTestSend: FC<EventsEmailTestSendProps> = ({ eventId }) => {
  const navigate = useNavigate()
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  // Populated from the Keycloak token at startup, so this is the signed-in user's own address.
  const userEmail = useAppSelector((state) => state.auth.user?.email)
  const [event, setEvent] = useState<EventResponse | null>(null)
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Nothing is selected to begin with, so the review below only appears once a choice is made.
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [addRecipients, setAddRecipients] = useState<AddRecipients | null>(null)
  const [otherEmail, setOtherEmail] = useState('')
  const [isEditValuesOpen, setEditValuesOpen] = useState(false)
  // The values the test will be sent with, and the notification they render to. Held here rather
  // than in the modal so they outlive it: the preview below shows the render, and the values are
  // ready for the send once there is an endpoint to send through.
  const [applied, setApplied] = useState<AppliedNotification | null>(null)
  const [isSending, setSending] = useState(false)
  // Which uploaded row the review is showing, and that row rendered.
  const [previewRow, setPreviewRow] = useState(0)
  const [rowRendered, setRowRendered] = useState<RenderedNotification | null>(null)
  const [isRowLoading, setRowLoading] = useState(false)

  // The page is landed on from the saved page and on a refresh, so it fetches the event itself
  // rather than being handed the settings it shows. Tenant-scoped, the same way the saved page is.
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

  const emailSettings = event?.emailSettings ?? null
  const templateId = emailSettings?.templateId ?? null

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

  const typedEmail = otherEmail.trim()
  // Only once something has been typed, so the field is not red before it has been used.
  const typedEmailError =
    typedEmail !== '' && !isValidEmail(typedEmail) ? 'Enter a valid email address.' : ''

  // The one address a test goes to, or null on the paths that do not have one: both single
  // recipient paths end here, while a spreadsheet addresses its own rows instead.
  const recipientEmail =
    recipient === 'myself'
      ? (userEmail ?? null)
      : recipient === 'other' && addRecipients === 'one' && typedEmail !== '' && !typedEmailError
        ? typedEmail
        : null

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

  // Nothing checked against the previous choice still applies once the choice changes.
  const clearUpload = useCallback(() => {
    resetCsv()
    setPreviewRow(0)
    setRowRendered(null)
  }, [resetCsv])

  // Render the row the review is showing. The subject line is where a missing value hides, so
  // each row is rendered by the API rather than shown as the raw template.
  useEffect(() => {
    if (!isCsvReady || !parsed || !templateId) return

    let active = true
    setRowLoading(true)

    previewTemplate(templateId, rowParams(parsed, previewRow, 'email'))
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
  }, [isCsvReady, parsed, previewRow, templateId])

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
    await csv.handleFileChange(nextFile)
  }

  const isReviewable = Boolean(template) && (Boolean(recipientEmail) || isCsvReady)
  const recipientCount = isManyRecipients ? csvRowCount : 1

  const handleSend = async () => {
    setSending(true)
    try {
      // The values the preview was rendered from, so what arrives is what was reviewed. Sending
      // none is allowed: the API answers with the placeholders the template still needs.
      // Recipients are only sent when they were chosen; the API defaults to the signed-in user.
      await sendEventTestEmail(
        eventId,
        applied?.values ?? {},
        isCsvReady && parsed
          ? { mergeArray: toMergeArray(parsed, 'email') }
          : recipient === 'other' && recipientEmail
            ? { to: [recipientEmail] }
            : undefined,
      )
      showSuccessToast('Test notification queued.')
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : 'Failed to send the test notification',
      )
    } finally {
      setSending(false)
    }
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

      <section className="events__section">
        {loadError ? (
          <div className="alert alert-danger">{loadError}</div>
        ) : !event ? (
          <p className="events__help">Loading event...</p>
        ) : !emailSettings ? (
          <p className="events__help">This event has no saved email notification settings yet.</p>
        ) : (
          <>
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
                    onChange={setOtherEmail}
                    isInvalid={Boolean(typedEmailError)}
                    errorMessage={typedEmailError}
                    size="small"
                  />
                )}
              </>
            )}

            {isManyRecipients && template && (
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
                  <Button variant="secondary" onPress={handleDownloadSample}>
                    Download sample CSV
                  </Button>
                </div>

                <FileUpload
                  label="Upload CSV file"
                  isRequired
                  accept=".csv,text/csv"
                  allowedExtensions={['.csv']}
                  file={csv.file}
                  onFileChange={(nextFile) => void handleFileChange(nextFile)}
                  maxSizeBytes={MAX_FILE_BYTES}
                  progress={csv.readProgress}
                  successMessage={csv.file && parsed ? 'File uploaded successfully' : undefined}
                  errorMessage={csv.fileIssue ?? undefined}
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
            )}

            {isReviewable && template && (
              <>
                <div className="events__subsection">
                  <h2 className="events__subheading">Review Notification</h2>
                  <p className="events__help">
                    Review the notification template and test data below before sending a test
                    notification.
                  </p>
                </div>

                <div className="events__test-send-review-bar">
                  {/* Uploaded values come from the file and cannot be edited here, so a CSV send
                      steps through its rows instead of offering Edit values. */}
                  {isCsvReady ? (
                    <>
                      <span className="events__test-send-position" aria-live="polite">
                        Email notification {previewRow + 1} of {csvRowCount}
                      </span>
                      <button
                        type="button"
                        className="events__test-send-nav"
                        onClick={() => setPreviewRow((row) => Math.max(0, row - 1))}
                        disabled={previewRow === 0 || isRowLoading}
                        aria-label="Previous"
                      >
                        <SvgChevronLeftIcon />
                      </button>
                      <button
                        type="button"
                        className="events__test-send-nav"
                        onClick={() => setPreviewRow((row) => Math.min(csvRowCount - 1, row + 1))}
                        disabled={previewRow >= csvRowCount - 1 || isRowLoading}
                        aria-label="Next"
                      >
                        <SvgChevronRightIcon />
                      </button>
                    </>
                  ) : (
                    <Button
                      size="medium"
                      variant="secondary"
                      onPress={() => setEditValuesOpen(true)}
                    >
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
                      to:
                        isCsvReady && parsed
                          ? rowRecipient(parsed, previewRow, 'email')
                          : (recipientEmail ?? ''),
                    }}
                    rendered={isCsvReady ? (rowRendered ?? undefined) : applied?.rendered}
                  />
                </div>

                {!isCsvReady && recipientEmail && (
                  <EventEmailPreviewModal
                    isOpen={isEditValuesOpen}
                    onClose={() => setEditValuesOpen(false)}
                    template={template}
                    emailSettings={emailSettings}
                    from={emailSettings.senderEmail ?? ''}
                    to={recipientEmail}
                    values={applied?.values ?? {}}
                    onApply={(next) => {
                      setApplied(next)
                      setEditValuesOpen(false)
                    }}
                  />
                )}
              </>
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
                isDisabled={!isReviewable || isSending}
              >
                {isSending ? 'Sending...' : `Send test email (${recipientCount})`}
              </Button>
            </StickyBar>
          </>
        )}
      </section>
    </div>
  )
}

export default EventsEmailTestSend
