import { TemplateEngine } from '@/api/templates.api'

export type VariableType = 'text' | 'boolean'

export interface DetectedVariable {
  name: string
  type: VariableType
}

// Matches a single identifier (e.g. firstName).
const IDENTIFIER = /^[a-zA-Z_$][\w$]*$/

// Tags are found with indexOf rather than a regex: a lazy group between optional-whitespace
// quantifiers rescans the body from every position when a tag is left unclosed, and the body is
// whatever the user has typed so far.

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

/** Collects detected variables, letting a conditional use win over a plain interpolation. */
class VariableCollector {
  private readonly found = new Map<string, VariableType>()

  add(name: string, type: VariableType): void {
    if (!IDENTIFIER.test(name)) return
    const existing = this.found.get(name)
    if (existing === undefined) {
      this.found.set(name, type)
    } else if (type === 'boolean' && existing !== 'boolean') {
      // A variable used in a condition wins the boolean treatment
      this.found.set(name, 'boolean')
    }
  }

  toList(): DetectedVariable[] {
    return [...this.found].map(([name, type]) => ({ name, type }))
  }
}

/**
 * Legacy GC Notify syntax:
 *   ((var))            plain interpolation -> free-text value
 *   ((var??content))   conditional: `content` shows when `var` is truthy, so `var` is a boolean
 *                      toggle. The content may span multiple lines and contain parentheses, so
 *                      each tag runs up to the first `))` after it opens.
 */
function collectLegacy(body: string, into: VariableCollector): void {
  for (const inner of legacyTagContents(body)) {
    const condIndex = inner.indexOf('??')
    if (condIndex === -1) {
      into.add(inner.trim(), 'text')
    } else {
      into.add(inner.slice(0, condIndex).trim(), 'boolean')
    }
  }
}

const BLOCK_HELPERS = new Set(['if', 'unless', 'each', 'with'])

/** A block open: {{#if x}}, {{#unless x}}, {{#each x}}, {{#with x}} or a section {{#x}}. */
function collectBlockOpen(inner: string, into: VariableCollector): void {
  const tokens = inner.slice(1).trim().split(/\s+/)
  const helper = tokens[0]

  if (BLOCK_HELPERS.has(helper) && tokens.length > 1) {
    const type: VariableType = helper === 'if' || helper === 'unless' ? 'boolean' : 'text'
    into.add(tokens.at(-1) as string, type)
    return
  }

  // Mustache section / inverted section: the token itself is the variable
  into.add(helper.replace(/^&/, ''), 'boolean')
}

/** Plain interpolation, possibly a helper call: {{x}}, {{& x}}, {{formatDate x}}. */
function collectInterpolation(inner: string, into: VariableCollector): void {
  const tokens = inner.replace(/^&\s*/, '').split(/\s+/)
  if (tokens.length === 1) {
    into.add(tokens[0], 'text')
    return
  }

  // Helper invocation - treat the arguments as variables
  for (const token of tokens.slice(1)) {
    into.add(token.replace(/^&/, ''), 'text')
  }
}

/** Handlebars / Mustache / MJML syntax: {{ var }} and {{{ var }}}. */
function collectMustache(body: string, into: VariableCollector): void {
  for (const tag of mustacheTagContents(body)) {
    const inner = tag.trim()
    if (!inner) continue

    const lead = inner[0]
    // Close tag, comment or partial, and {{else}}, reference no variable of their own.
    if (lead === '/' || lead === '!' || lead === '>' || inner === 'else') continue

    if (lead === '#' || lead === '^') {
      collectBlockOpen(inner, into)
    } else {
      collectInterpolation(inner, into)
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
  const collector = new VariableCollector()

  if (engine === TemplateEngine.LEGACY_GC_NOTIFY) {
    collectLegacy(body, collector)
  } else {
    collectMustache(body, collector)
  }

  return collector.toList()
}
