import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
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
  // Whether a valid render has been generated; when false the Rendered tab
  // shows a "Preview unavailable" placeholder instead of stale/empty output.
  const [hasApplied, setHasApplied] = useState(false)
  // Whether to surface per-field errors on empty required inputs.
  const [showErrors, setShowErrors] = useState(false)

  // Booleans always carry a value; text variables must be filled in.
  const requiredVariables = variables.filter((v) => v.type !== 'boolean')
  const isMissing = (name: string) => !(values[name] ?? '').trim()
  const missingCount = requiredVariables.filter((v) => isMissing(v.name)).length
  const hasMissing = missingCount > 0
  // Enable Apply once the user has entered a value (or nothing is required).
  const canApply = requiredVariables.length === 0 || missingCount < requiredVariables.length

  const runPreview = async (vals: Record<string, string>) => {
    const params: Record<string, string> = {}
    variables.forEach((v) => {
      const raw = vals[v.name] ?? ''
      // For a boolean toggle, "false" must render as falsy so the else/inverted
      // branch shows; an empty string is falsy in Handlebars and Mustache.
      params[v.name] = v.type === 'boolean' ? (raw === 'true' ? 'true' : '') : raw
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
    // Only render a preview when every required value is present; otherwise the
    // Rendered tab shows the "Preview unavailable" placeholder until applied.
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

  return (
    <NotificationPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Notification Preview"
      variables={variables.map((variable) => ({
        name: variable.name,
        value: values[variable.name] ?? '',
        type: variable.type,
        isInvalid: showErrors && variable.type !== 'boolean' && isMissing(variable.name),
        errorMessage: 'Enter a value to generate the preview',
      }))}
      variablesIntro="Enter values for all variables in your template."
      isEditable
      onVariableChange={(name, value) => handleValueChange(name)(value)}
      variablesFooter={
        <Button
          type="button"
          variant="secondary"
          onPress={() => {
            setActiveTab('rendered')
            if (hasMissing) {
              // Surface field errors and keep the preview unavailable.
              setShowErrors(true)
              setHasApplied(false)
            } else {
              setShowErrors(false)
              setHasApplied(true)
              void runPreview(values)
            }
          }}
          isDisabled={loading || !canApply}
        >
          {loading ? 'Applying...' : 'Apply to Preview'}
        </Button>
      }
      subject={channelCode === NotificationChannel.EMAIL ? subject : undefined}
      bodyHtml={activeTab === 'rendered' && hasApplied ? renderedHtml : undefined}
      bodyText={activeTab === 'rendered' ? rendered : body}
      bodyOverride={
        activeTab === 'rendered' && !hasApplied && !loading ? (
          <p className="notification-preview__placeholder">
            Preview unavailable. Provide values for all variables to view the rendered template.
          </p>
        ) : undefined
      }
      outputHeader={
        <ToggleButtonGroup
          aria-label="Preview mode"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[activeTab]}
          size="small"
          onSelectionChange={(keys) => {
            const [selected] = keys
            if (selected != null) {
              setActiveTab(selected as 'rendered' | 'raw')
            }
          }}
        >
          <ToggleButton id="rendered" size="small">
            Rendered Preview
          </ToggleButton>
          <ToggleButton id="raw" size="small">
            Raw Template
          </ToggleButton>
        </ToggleButtonGroup>
      }
      isLoading={loading && activeTab === 'rendered'}
      error={activeTab === 'rendered' ? error : null}
    />
  )
}

export default TemplatePreviewModal
