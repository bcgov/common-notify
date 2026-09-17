import { TemplateEngine } from '@/api/templates.api'

export type VariableType = 'text' | 'boolean'

export interface DetectedVariable {
  name: string
  type: VariableType
}

// Matches a single identifier (e.g. firstName).
const IDENTIFIER = /^[a-zA-Z_$][\w$]*$/

// Tags are found with indexOf rather than a regex: a lazy group between optional-whitespace
// quantifiers backtracks super-linearly on unclosed tags, and the body is user-typed.

/** Contents of each `((…))` tag, taking the first `))` that closes it. */
function* legacyTagContents(body: string): Generator<string> {
  let open = body.indexOf('((')
  while (open !== -1) {
    // A tag holds at least one character, so `(())` is not a tag.
    const close = body.indexOf('))', open + 3)
    if (close === -1) return
    yield body.slice(open + 2, close)
    open = body.indexOf('((', close + 2)
  }
}

/** Contents of each `{{…}}` or `{{{…}}}` tag. Contents never include `}`. */
function* mustacheTagContents(body: string): Generator<string> {
  let open = body.indexOf('{{')
  while (open !== -1) {
    const close = body.indexOf('}', open + 2)
    if (close === -1) return
    if (body.startsWith('}}', close)) {
      const content = body.slice(open + 2, close)
      yield content.startsWith('{') ? content.slice(1) : content
      open = body.indexOf('{{', close + 2)
    } else {
      open = body.indexOf('{{', open + 1)
    }
  }
}

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
    //                      multiple lines and contain parentheses, so each
    //                      tag runs up to the first `))` after it opens.
    for (const inner of legacyTagContents(body)) {
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
  for (const tag of mustacheTagContents(body)) {
    const inner = tag.trim()
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
