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

export function previewRenderParams(
  variables: DetectedVariable[],
  values: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    variables.map((variable) => {
      const raw = values[variable.name] ?? ''
      // Render a false toggle as falsy while preserving "false" in saved form values.
      return [variable.name, variable.type === 'boolean' && raw !== 'true' ? '' : raw]
    }),
  )
}
