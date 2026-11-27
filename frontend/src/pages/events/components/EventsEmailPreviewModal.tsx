import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps, FC } from 'react'
import { Button, InlineAlert } from '@bcgov/design-system-react-components'
import {
  getTemplatePreviewData,
  previewTemplate,
  saveTemplatePreviewData,
} from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import EmailBodyFrame from '@/components/EmailBodyFrame'
import EmailHeader from '@/components/EmailHeader'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import { detectVariables } from '@/utils/templateVariables'
import { initializePreviewValues, previewRenderParams } from '@/utils/templatePreviewValues'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { useAppSelector } from '@/redux/hooks'

interface EventsEmailPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  template: TemplateResponse
  /** The tab's header settings, shown above the body as the email will carry them. */
  header: ComponentProps<typeof EmailHeader>['emailSettings']
  /** The tab's sender email, shown as the From address it is being configured to send from. */
  senderEmail: string
  /** The tab's recipients, each list shown as its own envelope line. */
  toAddresses: string[]
  ccAddresses: string[]
  bccAddresses: string[]
}

/**
 * The event's selected template rendered as the email it will produce.
 *
 * Values are typed in here, like the template editor: an event has no spreadsheet to read them
 * off, and nothing is sent from this screen, so they are sample data for the preview only.
 */
const EventsEmailPreviewModal: FC<EventsEmailPreviewModalProps> = ({
  isOpen,
  onClose,
  template,
  header,
  senderEmail,
  toAddresses,
  ccAddresses,
  bccAddresses,
}) => {
  const { canEdit } = useCstarRoles()
  const tenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  const session = useRef(0)
  const applying = useRef(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [isNoticeVisible, setNoticeVisible] = useState(true)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState<string | undefined>()
  const [bodyText, setBodyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingValues, setSavingValues] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingValues, setLoadingValues] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // The subject can use variables too, and the preview fails without a value for every one.
  const variables = useMemo(
    () => detectVariables(`${template.subject ?? ''}\n${template.body}`, template.engineCode),
    [template.subject, template.body, template.engineCode],
  )

  const runPreview = useCallback(
    async (vals: Record<string, string>, persist = false) => {
      if (applying.current) return
      applying.current = true
      const currentSession = session.current
      const params = previewRenderParams(variables, vals)

      setLoading(true)
      setError(null)
      try {
        if (persist && canEdit) {
          setSavingValues(true)
          await saveTemplatePreviewData(template.id, vals)
          if (session.current !== currentSession) return
          setSavingValues(false)
        }
        const response = await previewTemplate(template.id, params)
        if (session.current !== currentSession) return
        setSubject(response.subject ?? '')
        setBodyHtml(response.html)
        setBodyText(response.body)
      } catch (err) {
        if (session.current === currentSession) {
          setError(err instanceof Error ? err.message : 'Failed to render preview')
          setBodyHtml(undefined)
          setBodyText('')
        }
      } finally {
        if (session.current === currentSession) {
          applying.current = false
          setSavingValues(false)
          setLoading(false)
        }
      }
    },
    [template.id, variables, canEdit],
  )

  // Reload shared values before rendering on every visit or template change.
  useEffect(() => {
    const currentSession = ++session.current
    applying.current = false
    setLoading(false)
    setSavingValues(false)
    if (!isOpen) return
    setValues({})
    setSubject('')
    setBodyHtml(undefined)
    setBodyText('')
    setError(null)
    setLoadError(null)
    setLoadingValues(true)
    setNoticeVisible(true)

    const initialize = async () => {
      try {
        const saved = await getTemplatePreviewData(template.id)
        if (session.current !== currentSession) return
        const initial = initializePreviewValues(variables, saved.params)
        setValues(initial)
        void runPreview(initial)
      } catch (err) {
        if (session.current === currentSession) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load preview values')
        }
      } finally {
        if (session.current === currentSession) setLoadingValues(false)
      }
    }
    void initialize()
    return () => {
      session.current++
    }
  }, [isOpen, template.id, template.version, variables, runPreview, tenantId, loadAttempt])

  let statusMessage = ''
  if (loadingValues) {
    statusMessage = 'Loading preview values...'
  } else if (savingValues) {
    statusMessage = 'Saving preview values...'
  } else if (loading) {
    statusMessage = 'Rendering preview...'
  }

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Notification Preview"
      notice={
        <>
          {loadError && (
            <div role="alert">
              <p>{loadError}</p>
              <Button
                type="button"
                variant="secondary"
                onPress={() => setLoadAttempt((n) => n + 1)}
              >
                Retry loading values
              </Button>
            </div>
          )}
          {isNoticeVisible && (
            <InlineAlert
              variant="info"
              description="Sample values are shared with the template editor. Editors can save changes by selecting Apply to Preview."
              isCloseable
              onClose={() => setNoticeVisible(false)}
            />
          )}
        </>
      }
      variables={variables.map((variable) => ({
        name: variable.name,
        value: values[variable.name] ?? '',
        type: variable.type,
        isOptional: variable.isOptional,
      }))}
      variablesIntro="Provide values for all variables in your template."
      isEditable={!loadingValues && !loading && !loadError}
      onVariableChange={(name, value) => setValues((prev) => ({ ...prev, [name]: value }))}
      variablesFooter={
        <Button
          type="button"
          variant="secondary"
          onPress={() => void runPreview(values, true)}
          isDisabled={loading || loadingValues || !!loadError}
        >
          {loading ? 'Applying...' : 'Apply to Preview'}
        </Button>
      }
      from={senderEmail || undefined}
      to={toAddresses.join(', ') || undefined}
      cc={ccAddresses.join(', ') || undefined}
      bcc={bccAddresses.join(', ') || undefined}
      subject={subject}
      outputHeader={<EmailHeader emailSettings={header} />}
      // The same frame as the test send preview. Only once a render has succeeded, so the
      // modal's own loading and error states still show.
      bodyOverride={
        !loading && !loadingValues && !error && !loadError && bodyHtml !== undefined ? (
          <EmailBodyFrame html={bodyHtml} />
        ) : undefined
      }
      bodyHtml={bodyHtml}
      bodyText={bodyText}
      isLoading={loading || loadingValues}
      statusMessage={statusMessage}
      error={error}
    />
  )
}

export default EventsEmailPreviewModal
