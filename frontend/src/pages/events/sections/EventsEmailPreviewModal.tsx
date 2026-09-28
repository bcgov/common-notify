import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { previewTemplate } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import { detectVariables } from '@/utils/templateVariables'

interface EventsEmailPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  template: TemplateResponse
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
  senderEmail,
  toAddresses,
  ccAddresses,
  bccAddresses,
}) => {
  const [values, setValues] = useState<Record<string, string>>({})
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState<string | undefined>()
  const [bodyText, setBodyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const variables = detectVariables(template.body, template.engineCode)

  const runPreview = useCallback(
    async (vals: Record<string, string>) => {
      const params: Record<string, string> = {}
      variables.forEach((variable) => {
        const raw = vals[variable.name] ?? ''
        // A boolean set to False must render as falsy so the else/inverted branch shows; an empty
        // string is falsy in every engine the editor previews with.
        params[variable.name] = variable.type === 'boolean' ? (raw === 'true' ? 'true' : '') : raw
      })

      setLoading(true)
      setError(null)
      try {
        const response = await previewTemplate(template.id, params)
        setSubject(response.subject ?? '')
        setBodyHtml(response.html)
        setBodyText(response.body)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to render preview')
        setBodyHtml(undefined)
        setBodyText('')
      } finally {
        setLoading(false)
      }
    },
    // `variables` is derived from the template body on every render; the template it comes from
    // is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template.id, template.body, template.engineCode],
  )

  // Each visit starts from default values and an initial render, rather than whatever the last
  // visit left behind - the template may have been changed in between.
  useEffect(() => {
    if (!isOpen) return
    const initial: Record<string, string> = {}
    variables.forEach((variable) => {
      initial[variable.name] = variable.type === 'boolean' ? 'true' : ''
    })
    setValues(initial)
    void runPreview(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, runPreview])

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Notification Preview"
      variables={variables.map((variable) => ({
        name: variable.name,
        value: values[variable.name] ?? '',
        type: variable.type,
      }))}
      variablesIntro="Enter sample values to see how this template will be rendered."
      isEditable
      onVariableChange={(name, value) => setValues((prev) => ({ ...prev, [name]: value }))}
      variablesFooter={
        <Button
          type="button"
          variant="secondary"
          onPress={() => void runPreview(values)}
          isDisabled={loading}
        >
          {loading ? 'Applying...' : 'Apply to Preview'}
        </Button>
      }
      from={senderEmail || undefined}
      to={toAddresses.join(', ') || undefined}
      cc={ccAddresses.join(', ') || undefined}
      bcc={bccAddresses.join(', ') || undefined}
      subject={subject}
      bodyHtml={bodyHtml}
      bodyText={bodyText}
      isLoading={loading}
      error={error}
    />
  )
}

export default EventsEmailPreviewModal
