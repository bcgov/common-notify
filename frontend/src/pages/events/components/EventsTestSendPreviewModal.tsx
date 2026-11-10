import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { Button, InlineAlert } from '@bcgov/design-system-react-components'
import EmailBodyFrame from '@/components/EmailBodyFrame'
import EmailHeader from '@/components/EmailHeader'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import { previewTemplate } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import type { EventEmailSettings } from '@/api/events.api'
import { detectVariables } from '@/utils/templateVariables'
import type { DetectedVariable } from '@/utils/templateVariables'
import type { RenderedNotification } from './EventsEmailPreview'

export interface AppliedNotification {
  /** What the fields hold, so reopening the modal shows them as they were left. */
  values: Record<string, string>
  /** What the template is rendered with. Send these, not `values`, so the email matches. */
  params: Record<string, string>
  rendered: RenderedNotification
}

/**
 * The template values a set of fields stands for. A condition is either 'true' or empty, since
 * a template treats any non-empty string as true - including 'false'.
 */
export function toTemplateParams(
  variables: readonly DetectedVariable[],
  values: Record<string, string>,
): Record<string, string> {
  const params: Record<string, string> = {}
  variables.forEach((variable) => {
    const raw = values[variable.name] ?? ''
    params[variable.name] = variable.type === 'boolean' && raw !== 'true' ? '' : raw
  })
  return params
}

interface EventsTestSendPreviewModalProps {
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

const EventsTestSendPreviewModal: FC<EventsTestSendPreviewModalProps> = ({
  isOpen,
  onClose,
  template,
  emailSettings,
  from,
  to,
  values,
  onApply,
}) => {
  // The subject can use variables too, and the preview fails without a value for every one.
  const variables = useMemo(
    () => detectVariables(`${template.subject ?? ''}\n${template.body}`, template.engineCode),
    [template.subject, template.body, template.engineCode],
  )

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState<string | undefined>()
  const [bodyText, setBodyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedNotice, setDismissedNotice] = useState<'info' | 'warning' | null>(null)
  // The draft the preview was last rendered from, so a change back to the opening values still
  // re-renders. Identity is enough: every edit makes a new object.
  const renderedDraft = useRef<Record<string, string> | null>(null)

  // A condition always holds true or false, so only text can be empty.
  const isEmptyField = (variable: DetectedVariable) =>
    variable.type !== 'boolean' && !(draft[variable.name] ?? '').trim()

  // Dismissed per message, so closing the note about values doesn't hide a later warning.
  const notice = variables.some(isEmptyField)
    ? ({ variant: 'warning', description: 'Some fields are empty.' } as const)
    : ({
        variant: 'info',
        description:
          'Notification values are generated from your API payload and notification event settings.',
      } as const)

  const runPreview = useCallback(
    async (params: Record<string, string>): Promise<RenderedNotification | null> => {
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
    [template.id],
  )

  // Load and display existing variables in the first render
  useEffect(() => {
    if (!isOpen) return

    const initial: Record<string, string> = {}
    variables.forEach((variable) => {
      initial[variable.name] = values[variable.name] ?? (variable.type === 'boolean' ? 'true' : '')
    })
    setDraft(initial)
    setDismissedNotice(null)
    renderedDraft.current = initial
    void runPreview(toTemplateParams(variables, initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, variables, runPreview])

  // Listen to the preview fields and re-render 500ms after the user stops typing
  useEffect(() => {
    if (!isOpen || draft === renderedDraft.current) return

    const timer = setTimeout(() => {
      renderedDraft.current = draft
      void runPreview(toTemplateParams(variables, draft))
    }, 500)
    return () => clearTimeout(timer)
  }, [isOpen, draft, variables, runPreview])

  const handleApply = async () => {
    // A debounced render may still be pending, so this renders the draft as it stands rather
    // than handing the page whatever the last render happened to produce.
    const params = toTemplateParams(variables, draft)
    const result = await runPreview(params)
    if (result) onApply({ values: draft, params, rendered: result })
  }

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Notification Values"
      className="notification-preview--test-send"
      notice={
        dismissedNotice === notice.variant ? undefined : (
          <InlineAlert
            key={notice.variant}
            variant={notice.variant}
            description={notice.description}
            isCloseable
            onClose={() => setDismissedNotice(notice.variant)}
          />
        )
      }
      variables={variables.map((variable) => ({
        name: variable.name,
        value: draft[variable.name] ?? '',
        type: variable.type,
        isInvalid: isEmptyField(variable),
        errorMessage: 'This field is empty.',
      }))}
      variablesHeading="Preview data"
      variablesIntro="Provide values for all variables in your template. The preview updates automatically as you make changes."
      isEditable
      onVariableChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
      from={from || undefined}
      to={to || undefined}
      subject={subject}
      outputHeader={<EmailHeader emailSettings={emailSettings} />}
      // The same frame as the preview on the page. Only once a render has succeeded, so the
      // modal's own loading and error states still show.
      bodyOverride={
        !loading && !error && bodyHtml !== undefined ? (
          <EmailBodyFrame html={bodyHtml} />
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
          isDisabled={loading}
        >
          {loading ? 'Applying...' : 'Apply to test notification'}
        </Button>
      }
    />
  )
}

export default EventsTestSendPreviewModal
