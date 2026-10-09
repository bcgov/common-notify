import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, InlineAlert } from '@bcgov/design-system-react-components'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import { previewTemplate } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import type { EventEmailSettings } from '@/api/events.api'
import { detectVariables } from '@/utils/templateVariables'
import EventEmailHeader from './EventEmailHeader'
import type { RenderedNotification } from './EventEmailPreview'

export interface AppliedNotification {
  values: Record<string, string>
  rendered: RenderedNotification
}

interface EventEmailPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  template: TemplateResponse
  /** The event's header settings, shown above the body as the email will carry it. */
  emailSettings: EventEmailSettings
  from: string
  to: string
  values: Record<string, string>
  onApply: (applied: AppliedNotification) => void
}

const EventEmailPreviewModal: FC<EventEmailPreviewModalProps> = ({
  isOpen,
  onClose,
  template,
  emailSettings,
  from,
  to,
  values,
  onApply,
}) => {
  const variables = useMemo(
    () => detectVariables(template.body, template.engineCode),
    [template.body, template.engineCode],
  )

  const [initialValues, setInitialValues] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState<string | undefined>()
  const [bodyText, setBodyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNoticeVisible, setNoticeVisible] = useState(true)

  const isDirty = variables.some(
    (variable) => (draft[variable.name] ?? '') !== (initialValues[variable.name] ?? ''),
  )

  const runPreview = useCallback(
    async (vals: Record<string, string>): Promise<RenderedNotification | null> => {
      const params: Record<string, string> = {}
      variables.forEach((variable) => {
        const raw = vals[variable.name] ?? ''
        params[variable.name] = variable.type === 'boolean' ? (raw === 'true' ? 'true' : '') : raw
      })

      setLoading(true)
      setError(null)
      try {
        const response = await previewTemplate(template.id, params)
        const result: RenderedNotification = {
          subject: response.subject ?? '',
          bodyHtml: response.html,
          bodyText: response.body,
        }
        setSubject(result.subject)
        setBodyHtml(result.bodyHtml)
        setBodyText(result.bodyText)
        return result
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to render preview')
        setBodyHtml(undefined)
        setBodyText('')
        return null
      } finally {
        setLoading(false)
      }
    },
    [template.id, variables],
  )

  // Load and display existing variables in the first render
  useEffect(() => {
    if (!isOpen) return

    const initial: Record<string, string> = {}
    variables.forEach((variable) => {
      initial[variable.name] = values[variable.name] ?? (variable.type === 'boolean' ? 'true' : '')
    })
    setInitialValues(initial)
    setDraft(initial)
    setNoticeVisible(true)
    void runPreview(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, variables, runPreview])

  // Listen to the preview fields and re-render 500ms after the user stops typing
  useEffect(() => {
    if (!isOpen || !isDirty) return

    const timer = setTimeout(() => void runPreview(draft), 500)
    return () => clearTimeout(timer)
  }, [isOpen, isDirty, draft, runPreview])

  const handleApply = async () => {
    // A debounced render may still be pending, so this renders the draft as it stands rather
    // than handing the page whatever the last render happened to produce.
    const result = await runPreview(draft)
    if (result) onApply({ values: draft, rendered: result })
  }

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Notification Values"
      notice={
        isNoticeVisible ? (
          <InlineAlert
            variant="info"
            description="Notification values are generated from your API payload and notification event settings."
            isCloseable
            onClose={() => setNoticeVisible(false)}
          />
        ) : undefined
      }
      variables={variables.map((variable) => ({
        name: variable.name,
        value: draft[variable.name] ?? '',
        type: variable.type,
      }))}
      variablesHeading="Notification values"
      variablesIntro="Provide values for all variables in your template. The preview updates automatically as you make changes."
      isEditable
      onVariableChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
      from={from || undefined}
      to={to || undefined}
      subject={subject}
      outputHeader={<EventEmailHeader emailSettings={emailSettings} />}
      // Inlined rather than framed, to match the preview on the page. Only once a render has
      // succeeded, so the modal's own loading and error states still show.
      bodyOverride={
        !loading && !error && bodyHtml !== undefined ? (
          <div className="events__preview-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        ) : undefined
      }
      bodyHtml={bodyHtml}
      bodyText={bodyText}
      isLoading={loading}
      error={error}
      footer={
        <Button
          type="button"
          variant="primary"
          onPress={() => void handleApply()}
          isDisabled={!isDirty || loading}
        >
          {loading ? 'Applying...' : 'Apply to test notification'}
        </Button>
      }
    />
  )
}

export default EventEmailPreviewModal
