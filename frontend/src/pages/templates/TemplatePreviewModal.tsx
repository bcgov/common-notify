import { useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import EmailBodyFrame from '@/components/EmailBodyFrame'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import TabBar from '@/components/TabBar'
import type { TemplateEngine } from '@/api/templates.api'
import { previewTemplateBody, NotificationChannel } from '@/api/templates.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { setPreviewValues } from '@/redux/slices/templates.slice'
import { detectVariables } from '@/utils/templateVariables'
import '@/scss/components/templates.scss'

interface TemplatePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  body: string
  subject?: string
  channelCode: NotificationChannel
  engineCode: TemplateEngine
}

const TemplatePreviewModal: FC<TemplatePreviewModalProps> = ({
  isOpen,
  onClose,
  body,
  subject,
  channelCode,
  engineCode,
}) => {
  const variables = useMemo(() => detectVariables(body, engineCode), [body, engineCode])

  const dispatch = useAppDispatch()
  const savedValues = useAppSelector((s) => s.templates.previewValues)

  const [values, setValues] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'rendered' | 'raw'>('rendered')
  const [rendered, setRendered] = useState<string>('')
  const [renderedHtml, setRenderedHtml] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether a render has been generated; when false the Rendered tab shows a
  // placeholder instead of stale/empty output.
  const [hasApplied, setHasApplied] = useState(false)
  // Whether to surface per-field errors on empty inputs, once a preview has been applied.
  const [showErrors, setShowErrors] = useState(false)

  const isMissing = (name: string) => !(values[name] ?? '').trim()

  const runPreview = async (vals: Record<string, string>) => {
    const params: Record<string, string> = {}
    variables.forEach((v) => {
      const raw = vals[v.name] ?? ''
      // For a boolean toggle, "false" must render as falsy so the else/inverted
      // branch shows; an empty string is falsy in Handlebars and Mustache.
      params[v.name] = v.type === 'boolean' && raw !== 'true' ? '' : raw
    })

    setLoading(true)
    setError(null)
    try {
      const result = await previewTemplateBody({
        body,
        subject: channelCode === NotificationChannel.EMAIL ? subject : undefined,
        channelCode,
        engineCode,
        params,
      })
      setRendered(result.body)
      setRenderedHtml(result.html)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render preview')
    } finally {
      setLoading(false)
    }
  }

  // When the modal opens, seed default values and render an initial preview
  useEffect(() => {
    if (!isOpen) return
    const initial: Record<string, string> = {}
    variables.forEach((v) => {
      initial[v.name] = savedValues[v.name] ?? (v.type === 'boolean' ? 'true' : '')
    })
    setValues(initial)
    setActiveTab('raw')
    setShowErrors(false)
    // Only render up front when every value is present; otherwise the Rendered tab
    // shows its placeholder until the user applies what they have.
    const missing = variables.some((v) => v.type !== 'boolean' && !(initial[v.name] ?? '').trim())
    if (missing) {
      setHasApplied(false)
      setRendered('')
      setRenderedHtml(undefined)
      setError(null)
    } else {
      setHasApplied(true)
      void runPreview(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleValueChange = (name: string) => (value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    dispatch(setPreviewValues({ [name]: value }))
  }

  let renderedOverride: ReactNode
  if (activeTab === 'rendered' && !hasApplied && !loading) {
    renderedOverride = (
      <p className="notification-preview__placeholder">
        Select Apply to template to view the rendered template.
      </p>
    )
  } else if (activeTab === 'rendered' && !loading && !error && renderedHtml !== undefined) {
    // Sized to its content and in the app font, like the events preview. Only once a render has
    // succeeded, so the modal's own loading and error states still show.
    renderedOverride = (
      <div className="template-preview__rendered">
        <EmailBodyFrame html={renderedHtml} />
      </div>
    )
  }

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Notification Preview"
      className="template-preview"
      variables={variables.map((variable) => ({
        name: variable.name,
        value: values[variable.name] ?? '',
        type: variable.type,
        isInvalid: showErrors && variable.type !== 'boolean' && isMissing(variable.name),
        errorMessage: 'This field is empty.',
      }))}
      variablesIntro="Enter values for all variables to view the rendered template."
      isEditable
      onVariableChange={(name, value) => handleValueChange(name)(value)}
      footer={
        <Button
          type="button"
          variant="primary"
          onPress={() => {
            setActiveTab('rendered')
            // Empty fields are flagged but still render, printing nothing.
            setShowErrors(true)
            setHasApplied(true)
            void runPreview(values)
          }}
          isDisabled={loading}
        >
          {loading ? 'Applying...' : 'Apply to template'}
        </Button>
      }
      bodyHtml={activeTab === 'rendered' && hasApplied ? renderedHtml : undefined}
      bodyText={activeTab === 'rendered' ? rendered : body}
      bodyOverride={renderedOverride}
      outputHeader={
        <>
          <div className="template-preview__output-intro">
            <h6 className="notification-preview__heading">Show preview</h6>
            <p className="notification-preview__intro">
              Preview how your template will appear using the provided values.
            </p>
          </div>
          <TabBar
            label="Preview mode"
            items={[
              { id: 'rendered', label: 'Rendered Preview' },
              { id: 'raw', label: 'Raw Template' },
            ]}
            selected={activeTab}
            onSelect={setActiveTab}
          />
        </>
      }
      isLoading={loading && activeTab === 'rendered'}
      error={activeTab === 'rendered' ? error : null}
    />
  )
}

export default TemplatePreviewModal
