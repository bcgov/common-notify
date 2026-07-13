import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  Button,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@bcgov/design-system-react-components'
import { previewTemplateBody, NotificationChannel, TemplateEngine } from '@/api/templates.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { setPreviewValues } from '@/redux/slices/templates.slice'
import '@/scss/components/templates.scss'

interface TemplatePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  body: string
  subject?: string
  channelCode: NotificationChannel
  engineCode: TemplateEngine
}

type VariableType = 'text' | 'boolean'

interface DetectedVariable {
  name: string
  type: VariableType
}

// Matches a simple identifier or dotted path (e.g. firstName, user.name)
const IDENTIFIER = /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/

/**
 * Parse a template body and detect the variables it references, so the user can
 * supply sample values. Variables used in a conditional (e.g. handlebars
 * {{#if x}} or a mustache section {{#x}}) are surfaced as boolean toggles;
 * everything else is a free-text value.
 */
function detectVariables(body: string, engine: TemplateEngine): DetectedVariable[] {
  const found = new Map<string, VariableType>()
  const addVar = (name: string, type: VariableType) => {
    const existing = found.get(name)
    if (existing === undefined) {
      found.set(name, type)
    } else if (type === 'boolean' && existing === 'text') {
      // A variable used in a condition wins the boolean treatment
      found.set(name, 'boolean')
    }
  }

  if (engine === TemplateEngine.LEGACY_GC_NOTIFY) {
    // Legacy GC Notify syntax: ((var)) or ((var??conditional text))
    const re = /\(\(\s*([^)]+?)\s*\)\)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(body)) !== null) {
      const name = match[1].split('??')[0].trim()
      if (IDENTIFIER.test(name)) addVar(name, 'text')
    }
    return [...found].map(([name, type]) => ({ name, type }))
  }

  // Handlebars / Mustache / MJML syntax: {{ var }} and {{{ var }}}
  const re = /\{\{\{?\s*([^}]+?)\s*\}?\}\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const inner = match[1].trim()
    if (!inner) continue

    const lead = inner[0]
    if (lead === '/' || lead === '!' || lead === '>') continue // close / comment / partial
    if (inner === 'else') continue

    if (lead === '#' || lead === '^') {
      // Block open: {{#if x}}, {{#unless x}}, {{#each x}}, {{#with x}} or section {{#x}}
      const tokens = inner.slice(1).trim().split(/\s+/)
      const helper = tokens[0]
      if (['if', 'unless', 'each', 'with'].includes(helper) && tokens.length > 1) {
        const name = tokens[tokens.length - 1]
        const type: VariableType = helper === 'if' || helper === 'unless' ? 'boolean' : 'text'
        if (IDENTIFIER.test(name)) addVar(name, type)
      } else {
        // Mustache section / inverted section: the token itself is the variable
        const name = helper.replace(/^&/, '')
        if (IDENTIFIER.test(name)) addVar(name, 'boolean')
      }
      continue
    }

    // Plain interpolation, possibly a helper call: {{x}}, {{& x}}, {{formatDate x}}
    const tokens = inner.replace(/^&\s*/, '').split(/\s+/)
    if (tokens.length === 1) {
      if (IDENTIFIER.test(tokens[0])) addVar(tokens[0], 'text')
    } else {
      // Helper invocation — treat the arguments as variables
      for (const token of tokens.slice(1)) {
        const arg = token.replace(/^&/, '')
        if (IDENTIFIER.test(arg)) addVar(arg, 'text')
      }
    }
  }

  return [...found].map(([name, type]) => ({ name, type }))
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    void runPreview(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Disable scrolling while modal is open
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleValueChange = (name: string) => (value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    dispatch(setPreviewValues({ [name]: value }))
  }

  return (
    <>
      <div className="modal-backdrop fade show template-preview__backdrop" />
      <div
        className="modal show template-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
      >
        <div className="modal-dialog modal-xl modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="template-preview-title">
                Preview
              </h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>

            <div className="modal-body template-preview__body">
              {/* Left pane: variable inputs */}
              <div className="template-preview__data">
                <h6 className="template-preview__heading">Preview data</h6>
                <p className="template-preview__intro">
                  Provide values for all variables in your template.
                </p>

                {variables.length === 0 ? (
                  <p className="template-preview__intro">No variables found.</p>
                ) : (
                  <div className="template-preview__fields">
                    {variables.map((variable) =>
                      variable.type === 'boolean' ? (
                        <div key={variable.name} className="template-preview__field-toggle">
                          <ToggleButtonGroup
                            label={variable.name}
                            selectionMode="single"
                            disallowEmptySelection
                            selectedKeys={[values[variable.name] ?? 'true']}
                            size="medium"
                            onSelectionChange={(keys) => {
                              const [selected] = keys
                              if (selected != null) {
                                handleValueChange(variable.name)(String(selected))
                              }
                            }}
                          >
                            <ToggleButton id="true">True</ToggleButton>
                            <ToggleButton id="false">False</ToggleButton>
                          </ToggleButtonGroup>
                        </div>
                      ) : (
                        <TextField
                          key={variable.name}
                          className="template-preview__field-text"
                          label={variable.name}
                          value={values[variable.name] ?? ''}
                          onChange={handleValueChange(variable.name)}
                        />
                      ),
                    )}
                  </div>
                )}

                <div className="template-preview__apply">
                  <Button
                    type="button"
                    variant="primary"
                    onPress={() => {
                      setActiveTab('rendered')
                      void runPreview(values)
                    }}
                    isDisabled={loading}
                  >
                    {loading ? 'Applying...' : 'Apply to Preview'}
                  </Button>
                </div>
              </div>

              {/* Right pane: preview output */}
              <div className="template-preview__preview">
                <div className="template-preview__preview-main">
                  <h6 className="template-preview__heading">Show preview</h6>
                  <p className="template-preview__intro">
                    Preview how your template will appear using the provided values.
                  </p>

                  <div className="template-preview__tabs">
                    <ToggleButtonGroup
                      aria-label="Preview mode"
                      selectionMode="single"
                      disallowEmptySelection
                      selectedKeys={[activeTab]}
                      size="medium"
                      onSelectionChange={(keys) => {
                        const [selected] = keys
                        if (selected != null) {
                          setActiveTab(selected as 'rendered' | 'raw')
                        }
                      }}
                    >
                      <ToggleButton id="rendered">Rendered Preview</ToggleButton>
                      <ToggleButton id="raw">Raw Template</ToggleButton>
                    </ToggleButtonGroup>
                  </div>

                  <div className="template-preview__output">
                    {activeTab === 'raw' ? (
                      body
                    ) : error ? (
                      <span className="template-preview__error">{error}</span>
                    ) : loading ? (
                      <span className="template-preview__placeholder">Rendering preview...</span>
                    ) : (
                      rendered
                    )}
                  </div>
                </div>

                <div className="template-preview__footer">
                  <button type="button" className="template-preview__close" onClick={onClose}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default TemplatePreviewModal
