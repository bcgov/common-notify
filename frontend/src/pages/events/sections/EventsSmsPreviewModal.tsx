import { useEffect, useMemo, useState } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import NotificationPreviewModal from '@/components/NotificationPreviewModal'
import { previewTemplate } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { detectVariables } from '@/utils/templateVariables'
import EventsSmsEstimate from '../components/EventsSmsEstimate'

interface Props {
  template: TemplateResponse
  to: string[]
  initialValues: Record<string, string>
  onClose: () => void
  onSaveValues: (values: Record<string, string>) => void
}

export default function EventsSmsPreviewModal({
  template,
  to,
  initialValues,
  onClose,
  onSaveValues,
}: Props) {
  const variables = useMemo(
    () => detectVariables(template.body, template.engineCode),
    [template.body, template.engineCode],
  )
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variables.map((variable) => [
        variable.name,
        initialValues[variable.name] ?? (variable.type === 'boolean' ? 'true' : ''),
      ]),
    ),
  )
  const [result, setResult] = useState<{ body: string; error: string | null; loading: boolean }>({
    body: '',
    error: null,
    loading: true,
  })
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      const params = Object.fromEntries(
        variables.map((variable) => {
          const value = values[variable.name] ?? ''
          return [
            variable.name,
            variable.type === 'boolean' ? (value === 'true' ? 'true' : '') : value,
          ]
        }),
      )
      previewTemplate(template.id, params)
        .then((response) => {
          if (current) setResult({ body: response.body, error: null, loading: false })
        })
        .catch((error) => {
          if (current)
            setResult({
              body: '',
              error:
                error instanceof Error ? error.message : 'Unable to render preview. Try again.',
              loading: false,
            })
        })
    }, 250)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [template.id, variables, values])

  const missing = (name: string) => !values[name]?.trim()
  return (
    <NotificationPreviewModal
      isOpen
      onClose={onClose}
      title="SMS Notification Preview"
      variablesHeading="Notification values"
      variablesIntro="Provide values for all variables in your template. The preview updates automatically as you make changes."
      notice={
        <p className="events__sms-preview-notice">
          These sample values are kept for this editing session only. They do not change the
          template or send a notification.
        </p>
      }
      closeButton={
        <Button type="button" variant="tertiary" onPress={onClose} aria-label="Close SMS preview">
          Close
        </Button>
      }
      variables={variables.map((variable) => ({
        name: variable.name,
        type: variable.type,
        value: values[variable.name] ?? '',
        isInvalid: attempted && missing(variable.name),
        errorMessage: 'Enter a value.',
      }))}
      isEditable
      onVariableChange={(name, value) => {
        setResult((previous) => ({ ...previous, loading: true, error: null }))
        setValues((previous) => ({ ...previous, [name]: value }))
      }}
      from="Not assigned"
      to={to.join(', ')}
      bodyText={result.body}
      isLoading={result.loading}
      error={result.error}
      outputFooter={<EventsSmsEstimate body={result.body} />}
      footer={
        <Button
          type="button"
          variant="primary"
          onPress={() => {
            setAttempted(true)
            if (variables.some((variable) => missing(variable.name))) return
            onSaveValues(values)
          }}
        >
          Save notification values
        </Button>
      }
    />
  )
}
