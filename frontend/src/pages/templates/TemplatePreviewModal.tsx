import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  Button,
  Switch,
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
    } else if (type === 'boolean' && existing !== 'boolean') {
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
      setError(null)
    } else {
      setHasApplied(true)
      void runPreview(initial)
    }
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
                Email Notification Preview
              </h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>

            <div className="modal-body template-preview__body">
              {/* Left pane: variable inputs */}
              <div className="template-preview__data">
                <h6 className="template-preview__heading">Preview data</h6>
                <p className="template-preview__intro">
                  Enter values for all variables to view the rendered template.
                </p>

                {variables.length === 0 ? (
                  <p className="template-preview__intro">No variables found.</p>
                ) : (
                  <div className="template-preview__fields">
                    {variables.map((variable) =>
                      variable.type === 'boolean' ? (
                        <div key={variable.name} className="template-preview__field-switch">
                          <span className="template-preview__switch-label">{variable.name}</span>
                          <Switch
                            isSelected={(values[variable.name] ?? 'true') === 'true'}
                            onChange={(isSelected) =>
                              handleValueChange(variable.name)(isSelected ? 'true' : 'false')
                            }
                          >
                            {(values[variable.name] ?? 'true') === 'true' ? 'True' : 'False'}
                          </Switch>
                        </div>
                      ) : (
                        // Wrap rather than pass `className` to TextField: the DS
                        // spreads props over its own `bcds-react-aria-TextField`
                        // class, so a className here would strip it and break the
                        // `[data-invalid]` red border.
                        <div key={variable.name} className="template-preview__field-text">
                          <TextField
                            label={variable.name}
                            value={values[variable.name] ?? ''}
                            onChange={handleValueChange(variable.name)}
                            isRequired
                            isInvalid={showErrors && isMissing(variable.name)}
                            errorMessage="Enter a value to generate the preview"
                            // The DS TextField omits `placeholder` from its types, but
                            // react-aria's useTextField still forwards it to the input.
                            {...({ placeholder: `Enter text...` } as { placeholder?: string })}
                          />
                        </div>
                      ),
                    )}
                  </div>
                )}

                <div className="template-preview__apply">
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
                  </div>

                  <div
                    className={
                      activeTab === 'rendered' && !hasApplied
                        ? 'template-preview__output template-preview__output--disabled'
                        : 'template-preview__output'
                    }
                  >
                    {activeTab === 'raw' ? (
                      body
                    ) : !hasApplied ? (
                      <span className="template-preview__unavailable">
                        <span className="template-preview__unavailable-title">
                          Preview unavailable.
                        </span>
                        <span className="template-preview__unavailable-desc">
                          Provide values for all variables to view the rendered template.
                        </span>
                      </span>
                    ) : error ? (
                      <span className="template-preview__error">{error}</span>
                    ) : loading ? (
                      <span className="template-preview__placeholder">Rendering preview...</span>
                    ) : (
                      rendered
                    )}
                  </div>
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
