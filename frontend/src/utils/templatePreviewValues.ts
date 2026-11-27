import { setParam } from './nestedParams'
import type { DetectedVariable } from './templateVariables'

export function initializePreviewValues(
  variables: DetectedVariable[],
  saved: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    variables.map((variable) => {
      const fallback = variable.type === 'boolean' ? 'true' : ''
      const value = Object.hasOwn(saved, variable.name) ? saved[variable.name] : fallback
      return [variable.name, value]
    }),
  )
}

/**
 * Whether a field still needs a value. A toggle always holds one, and an optional field's blank
 * value is meaningful - it hides the section that tests it - so only a required text field can be
 * missing.
 */
export function isMissingPreviewValue(
  variable: DetectedVariable,
  values: Record<string, string>,
): boolean {
  return variable.type === 'text' && !variable.isOptional && !(values[variable.name] ?? '').trim()
}

/**
 * The params a template is rendered with. A dotted name (`user.name`) becomes a nested object, the
 * shape an API caller sends, while the form values stay keyed by the flat name.
 */
export function previewRenderParams(
  variables: DetectedVariable[],
  values: Record<string, string>,
): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const variable of variables) {
    const raw = values[variable.name] ?? ''
    // Render a false toggle as falsy while preserving "false" in saved form values.
    setParam(params, variable.name, variable.type === 'boolean' && raw !== 'true' ? '' : raw)
  }
  return params
}
