import { TemplateEngine } from '@/api/templates.api'

export type VariableType = 'text' | 'boolean'

export interface DetectedVariable {
  name: string
  type: VariableType
}

// Matches a single identifier (e.g. firstName).
const IDENTIFIER = /^[a-zA-Z_$][\w$]*$/

/**
 * Parse a template body and detect the variables it references, so the user can
 * supply sample values. Variables used in a conditional (e.g. handlebars
 * {{#if x}} or a mustache section {{#x}}) are surfaced as boolean toggles;
 * everything else is a free-text value.
 */
export function detectVariables(body: string, engine: TemplateEngine): DetectedVariable[] {
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
    // Legacy GC Notify syntax:
    //   ((var))            plain interpolation -> free-text value
    //   ((var??content))   conditional: `content` shows when `var` is truthy,
    //                      so `var` is a boolean toggle. The content may span
    //                      multiple lines and contain parentheses, so match
    //                      lazily up to the closing `))` with the dotAll flag.
    const re = /\(\(\s*([\s\S]+?)\s*\)\)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(body)) !== null) {
      const inner = match[1]
      const condIndex = inner.indexOf('??')
      if (condIndex !== -1) {
        const name = inner.slice(0, condIndex).trim()
        if (IDENTIFIER.test(name)) addVar(name, 'boolean')
      } else if (IDENTIFIER.test(inner.trim())) {
        addVar(inner.trim(), 'text')
      }
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
