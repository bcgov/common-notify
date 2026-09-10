import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  Button,
  Callout,
  InlineAlert,
  Radio,
  RadioGroup,
  Select,
} from '@bcgov/design-system-react-components'
import { getTemplateById, getTemplates, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import {
  sendBulkNotifications,
  BulkNotificationsValidationError,
} from '@/api/bulkNotifications.api'
import { useAppSelector } from '@/redux/hooks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import FileUpload from '@/components/FileUpload'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { useCsvUpload } from '@/hooks/useCsvUpload'
import {
  buildSampleCsv,
  csvFilenameFor,
  downloadCsv,
  toMergeArray,
  MAX_FILE_BYTES,
} from '@/utils/bulkNotificationsCsv'
import BulkNotificationsPreviewModal from './sections/BulkNotificationsPreviewModal'
import CsvIssuesTable from './sections/CsvIssuesTable'
import TemplatePreview from './sections/TemplatePreview'
import SendResultPanel from './sections/SendResultPanel'
import type { SendResult } from './sections/SendResultPanel'
import '@/scss/components/bulk-notifications.scss'

/** Channels the screen offers. SMS is offered but not selectable - see the radio group below. */
type Channel = 'email' | 'sms'

const BulkNotifications: FC = () => {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  // Template editors send as well as operations admins, matching the roles on the
  // frontend notifysimple endpoint. `canEdit` is exactly that pair.
  const { canEdit: canSend } = useCstarRoles()

  const [channel, setChannel] = useState<Channel | null>(null)
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>()
  const [templateDetail, setTemplateDetail] = useState<TemplateResponse | null>(null)
  const [isLoadingTemplate, setLoadingTemplate] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [isPreviewOpen, setPreviewOpen] = useState(false)
  const [isSending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)

  const placeholders = templateDetail?.placeholders?.paths ?? []
  const unsupported = templateDetail?.placeholders?.unsupported ?? []

  const csv = useCsvUpload(placeholders)
  const { reset: resetCsv } = csv

  // Fetched here rather than read from the templates slice: that slice holds the Templates page's
  // paginated, filtered query, and reusing it would mean rewriting its filters on every visit.
  useEffect(() => {
    if (!selectedTenant) return

    let active = true
    getTemplates(1, 100, undefined, 'name', [`channelCode:eq:${NotificationChannel.EMAIL}`])
      .then((response) => {
        if (active) setTemplates(response.data)
      })
      .catch(() => {
        if (active) showErrorToast('Could not load templates. Refresh to try again.')
      })

    return () => {
      active = false
    }
  }, [selectedTenant])

  /**
   * The columns come from the API, not from parsing the template here.
   *
   * The server already decides which keys a template requires when it renders, and a second
   * implementation in the browser drifted from it - dotted paths were dropped and loop variables
   * were offered as columns.
   */
  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateDetail(null)
      return
    }

    let active = true
    setLoadingTemplate(true)
    getTemplateById(selectedTemplateId)
      .then((detail) => {
        if (active) setTemplateDetail(detail)
      })
      .catch(() => {
        if (active) {
          setTemplateDetail(null)
          showErrorToast('Could not read this template. Pick it again to retry.')
        }
      })
      .finally(() => {
        if (active) setLoadingTemplate(false)
      })

    return () => {
      active = false
    }
  }, [selectedTemplateId])

  /**
   * Nothing checked against the old template still applies, and neither does its outcome.
   *
   * Memoised because the tenant effect below depends on it; `resetCsv` is stable, so this is too
   * and the effect still runs only when the tenant changes.
   */
  const clearUpload = useCallback(() => {
    resetCsv()
    setSubmitAttempted(false)
    setResult(null)
  }, [resetCsv])

  // A different tenant means different templates, so nothing from the previous one still applies.
  useEffect(() => {
    setChannel(null)
    setSelectedTemplateId(undefined)
    clearUpload()
  }, [selectedTenant, clearUpload])

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)

  const templateItems = useMemo(
    () => templates.map((template) => ({ id: template.id, label: template.name })),
    [templates],
  )

  const isUsableTemplate = selectedTemplate !== undefined && unsupported.length === 0
  const isValid =
    isUsableTemplate && csv.parsed !== null && csv.fileIssue === null && csv.rowIssues.length === 0

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    // The uploaded file was checked against the previous template's columns, so it has to go.
    clearUpload()
  }

  const handleDownload = () => {
    if (!selectedTemplate) return
    downloadCsv(csvFilenameFor(selectedTemplate.name), buildSampleCsv(placeholders))
    showSuccessToast(
      'Sample CSV downloaded.',
      'Complete the file and upload it to continue with the bulk send.',
    )
  }

  const handleFileChange = async (nextFile: File | null) => {
    setResult(null)
    setSubmitAttempted(false)
    await csv.handleFileChange(nextFile)
  }

  const handleSend = async () => {
    if (!selectedTemplateId || !csv.parsed) {
      setSubmitAttempted(true)
      return
    }

    const rowCount = csv.parsed.rows.length
    setSending(true)
    try {
      const response = await sendBulkNotifications(selectedTemplateId, toMergeArray(csv.parsed))
      setResult({
        notifyId: response.notifyId,
        recipientCount: response.recipientCount ?? rowCount,
        blockedRecipientCount: response.blockedRecipientCount,
        blockedMessage: response.blockedMessage,
      })
      showSuccessToast('Notifications queued.')
      csv.reset()
    } catch (error) {
      if (error instanceof BulkNotificationsValidationError) {
        // The API found something the file checks did not - report it the same way.
        csv.reportFileIssue(error.errors[0])
        showErrorToast('This file was rejected. See the problem below.')
      } else {
        showErrorToast(error instanceof Error ? error.message : 'Failed to send notifications')
      }
    } finally {
      setSending(false)
    }
  }

  const missingFileError =
    submitAttempted && !csv.file ? 'A CSV file is required to continue.' : undefined

  return (
    <div className="page bulk-notifications">
      <PageHeading title="Bulk Notifications" />

      {!canSend && (
        <p className="bulk-notifications__notice">
          Sending bulk notifications needs the Template Editor or Tenant Administrator role. You can
          still download a sample CSV for a template.
        </p>
      )}

      <RadioGroup
        label="Notification channel"
        isRequired
        value={channel ?? ''}
        onChange={(value) => {
          setChannel(value as Channel)
          setSelectedTemplateId(undefined)
          clearUpload()
        }}
      >
        <Radio value="email">Email notification</Radio>
        {/* Offered but not selectable: the send pipeline is email-only - `mergeArray` exists on the
            email channel alone - so the option shows the roadmap without offering a control that
            cannot work. */}
        <Radio value="sms" isDisabled>
          SMS notification
        </Radio>
      </RadioGroup>

      {channel && (
        <div className="bulk-notifications__field">
          <Select
            label="Template"
            placeholder="Select a template..."
            items={templateItems}
            value={selectedTemplateId}
            onChange={(key) => handleTemplateChange(String(key))}
            isDisabled={templateItems.length === 0}
            isRequired
          />
          {templates.length === 0 && (
            <p className="bulk-notifications__hint">
              This tenant has no email templates yet. Create one under Templates first.
            </p>
          )}
        </div>
      )}

      {selectedTemplate && unsupported.length > 0 && (
        <InlineAlert
          variant="warning"
          title="This template can't be used for a bulk send."
          description={`It repeats a list (${unsupported.join(', ')}). A spreadsheet row holds one value per column, so it cannot supply a list of items. Pick a template without repeated sections, or send this one through the API.`}
        />
      )}

      {selectedTemplate && !isLoadingTemplate && unsupported.length === 0 && (
        <>
          <TemplatePreview template={selectedTemplate} />

          <div>
            <Button variant="secondary" onPress={handleDownload}>
              Download sample CSV
            </Button>
          </div>

          <Callout
            variant="lightGrey"
            title="Tip"
            description="Download the sample CSV to see the expected columns and format. Add the information needed for your template and upload the completed CSV below."
          />

          <FileUpload
            label="Upload CSV file"
            isRequired
            accept=".csv,text/csv"
            allowedExtensions={['.csv']}
            file={csv.file}
            onFileChange={(nextFile) => void handleFileChange(nextFile)}
            maxSizeBytes={MAX_FILE_BYTES}
            progress={csv.readProgress}
            successMessage={csv.file && csv.parsed ? 'File uploaded successfully' : undefined}
            errorMessage={csv.fileIssue ?? missingFileError}
            hint="Max file size: 5 MB"
          />

          <CsvIssuesTable issues={csv.rowIssues} />

          {isValid && (
            <InlineAlert
              variant="success"
              title="All required data passed validation."
              description="You can continue to the next step."
            />
          )}
        </>
      )}

      {result && <SendResultPanel result={result} />}

      <div className="bulk-notifications__actions">
        <Button
          variant="secondary"
          onPress={() => setPreviewOpen(true)}
          isDisabled={!isValid || isSending}
        >
          Preview
        </Button>
        <Button
          variant="primary"
          onPress={() => void handleSend()}
          isDisabled={!isValid || !canSend || isSending}
        >
          {isSending ? 'Sending...' : 'Send notifications'}
        </Button>
      </div>

      {isValid && selectedTemplateId && csv.parsed && (
        <BulkNotificationsPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setPreviewOpen(false)}
          templateId={selectedTemplateId}
          parsed={csv.parsed}
          isSending={isSending}
          onSend={() => {
            setPreviewOpen(false)
            void handleSend()
          }}
        />
      )}
    </div>
  )
}

export default BulkNotifications
