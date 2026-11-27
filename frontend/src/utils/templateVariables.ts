import { TemplateEngine } from '@/api/templates.api'

export type VariableType = 'text' | 'boolean'

export interface DetectedVariable {
  name: string
  type: VariableType
  /** Printed and also tested, so a blank value is meaningful: it hides the tested section. */
  isOptional?: boolean
}

/** How a template uses a variable: printed into the output, or tested by a condition. */
type VariableUse = 'printed' | 'tested'

// Matches a single identifier (e.g. firstName). Legacy GC Notify has no dotted syntax.
const IDENTIFIER = /^[a-zA-Z_$][\w$]*$/

// Matches an identifier or a dotted path of them (e.g. user.firstName), which Handlebars and
// Mustache resolve against nested data. `this.x` is the current context, not template data.
const PATH = /^(?!this\.)[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/

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

/**
 * Collects detected variables and how each is used. A variable that is only tested is a True/False
 * toggle; one that is printed anywhere needs a real value, so it is free text - and when it is also
 * tested, a blank value is how the preview shows the section hidden.
 */
class VariableCollector {
  private readonly found = new Map<string, Set<VariableUse>>()

  /** @param namePattern Which names are variables; anything else is skipped. */
  constructor(private readonly namePattern: RegExp) {}

  add(name: string, use: VariableUse): void {
    if (!this.namePattern.test(name)) return
    const uses = this.found.get(name)
    if (uses) {
      uses.add(use)
    } else {
      this.found.set(name, new Set([use]))
    }
  }

  toList(): DetectedVariable[] {
    return [...this.found].map(([name, uses]): DetectedVariable => {
      if (!uses.has('printed')) return { name, type: 'boolean' }
      return uses.has('tested') ? { name, type: 'text', isOptional: true } : { name, type: 'text' }
    })
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
      into.add(inner.trim(), 'printed')
    } else {
      into.add(inner.slice(0, condIndex).trim(), 'tested')
    }
  }
}

const BLOCK_HELPERS = new Set(['if', 'unless', 'each', 'with'])

/** A block open: {{#if x}}, {{#unless x}}, {{#each x}}, {{#with x}} or a section {{#x}}. */
function collectBlockOpen(inner: string, into: VariableCollector): void {
  const tokens = inner.slice(1).trim().split(/\s+/)
  const helper = tokens[0]

  if (BLOCK_HELPERS.has(helper) && tokens.length > 1) {
    // #each / #with take a value rather than a condition, so they count as printed.
    const use: VariableUse = helper === 'if' || helper === 'unless' ? 'tested' : 'printed'
    into.add(tokens.at(-1) as string, use)
    return
  }

  // Mustache section / inverted section: the token itself is the variable
  into.add(helper.replace(/^&/, ''), 'tested')
}

/** Plain interpolation, possibly a helper call: {{x}}, {{& x}}, {{formatDate x}}. */
function collectInterpolation(inner: string, into: VariableCollector): void {
  const tokens = inner.replace(/^&\s*/, '').split(/\s+/)
  if (tokens.length === 1) {
    into.add(tokens[0], 'printed')
    return
  }

  // Helper invocation - treat the arguments as variables
  for (const token of tokens.slice(1)) {
    into.add(token.replace(/^&/, ''), 'printed')
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
 * supply sample values. Variables only used in a conditional (e.g. handlebars
 * {{#if x}} or a mustache section {{#x}}) are surfaced as boolean toggles;
 * everything else is a free-text value, optional when it is also tested.
 */
export function detectVariables(body: string, engine: TemplateEngine): DetectedVariable[] {
  if (engine === TemplateEngine.LEGACY_GC_NOTIFY) {
    const collector = new VariableCollector(IDENTIFIER)
    collectLegacy(body, collector)
    return collector.toList()
  }

  const collector = new VariableCollector(PATH)
  collectMustache(body, collector)

  return collector.toList()
}
