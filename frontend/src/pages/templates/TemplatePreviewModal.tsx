import { useEffect, useMemo, useRef, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import EmailBodyFrame from '@/components/EmailBodyFrame'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import TabBar from '@/components/TabBar'
import type { TemplateEngine } from '@/api/templates.api'
import {
  previewTemplateBody,
  getTemplatePreviewData,
  saveTemplatePreviewData,
  NotificationChannel,
} from '@/api/templates.api'
import { useAppSelector } from '@/redux/hooks'
import { detectVariables } from '@/utils/templateVariables'
import '@/scss/components/templates.scss'

interface TemplatePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  body: string
  subject?: string
  channelCode: NotificationChannel
  engineCode: TemplateEngine
  templateId?: string
  canSave?: boolean
  draftValues?: Record<string, string>
  onDraftValuesChange?: (values: Record<string, string>) => void
}

const TemplatePreviewModal: FC<TemplatePreviewModalProps> = ({
  isOpen,
  onClose,
  body,
  subject,
  channelCode,
  engineCode,
  templateId,
  canSave = false,
  draftValues,
  onDraftValuesChange,
}) => {
  const variables = useMemo(
    () => detectVariables(`${subject ?? ''}\n${body}`, engineCode),
    [subject, body, engineCode],
  )

  const tenantId = useAppSelector((s) => s.tenant.selectedTenant?.id)
  const session = useRef(0)
  const applying = useRef(false)

  const [values, setValues] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'rendered' | 'raw'>('rendered')
  const [rendered, setRendered] = useState<string>('')
  const [renderedHtml, setRenderedHtml] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingValues, setLoadingValues] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  // Whether a render has been generated; when false the Rendered tab shows a
  // placeholder instead of stale/empty output.
  const [hasApplied, setHasApplied] = useState(false)
  // Whether to surface per-field errors on empty inputs, once a preview has been applied.
  const [showErrors, setShowErrors] = useState(false)

  const isMissing = (name: string) => !(values[name] ?? '').trim()

  const runPreview = async (vals: Record<string, string>, persist = false) => {
    if (applying.current) return
    applying.current = true
    const currentSession = session.current
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
      if (persist && templateId && canSave) {
        await saveTemplatePreviewData(templateId, vals)
        if (session.current !== currentSession) return
      }
      const result = await previewTemplateBody({
        body,
        subject: channelCode === NotificationChannel.EMAIL ? subject : undefined,
        channelCode,
        engineCode,
        params,
      })
      if (session.current !== currentSession) return
      setRendered(result.body)
      setRenderedHtml(result.html)
    } catch (err) {
      if (session.current === currentSession) {
        setError(err instanceof Error ? err.message : 'Failed to render preview')
      }
    } finally {
      if (session.current === currentSession) {
        applying.current = false
        setLoading(false)
      }
    }
  }

  // Each visit reloads shared values. Draft changes stay in the parent form.
  useEffect(() => {
    const currentSession = ++session.current
    applying.current = false
    setLoading(false)
    if (!isOpen) return
    setValues({})
    setActiveTab('raw')
    setShowErrors(false)
    setHasApplied(false)
    setRendered('')
    setRenderedHtml(undefined)
    setError(null)
    setLoadError(null)
    setLoadingValues(true)

    const initialize = async () => {
      try {
        const saved = templateId
          ? (await getTemplatePreviewData(templateId)).params
          : (draftValues ?? {})
        if (session.current !== currentSession) return
        const initial = Object.fromEntries(
          variables.map((v) => [
            v.name,
            Object.prototype.hasOwnProperty.call(saved, v.name)
              ? saved[v.name]
              : v.type === 'boolean'
                ? 'true'
                : '',
          ]),
        )
        setValues(initial)
        onDraftValuesChange?.(initial)
        const missing = variables.some(
          (v) => v.type !== 'boolean' && !(initial[v.name] ?? '').trim(),
        )
        if (!missing) {
          setHasApplied(true)
          void runPreview(initial)
        }
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
    // Initialize from the current content and draft on opening, without resetting typed values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, templateId, tenantId, loadAttempt])

  const handleValueChange = (name: string) => (value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    onDraftValuesChange?.({ ...values, [name]: value })
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
      notice={
        loadError ? (
          <div role="alert">
            <p>{loadError}</p>
            <Button type="button" variant="secondary" onPress={() => setLoadAttempt((n) => n + 1)}>
              Retry loading values
            </Button>
          </div>
        ) : loadingValues ? (
          <p role="status">Loading preview values...</p>
        ) : undefined
      }
      variables={variables.map((variable) => ({
        name: variable.name,
        value: values[variable.name] ?? '',
        type: variable.type,
        isInvalid: showErrors && variable.type !== 'boolean' && isMissing(variable.name),
        errorMessage: 'This field is empty.',
      }))}
      variablesIntro="Enter values for all variables to view the rendered template."
      isEditable={!loadingValues && !loadError}
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
            void runPreview(values, true)
          }}
          isDisabled={loading || loadingValues || !!loadError}
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
