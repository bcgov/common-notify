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
// Mustache resolve against nested data. `this` and `this.x` are the current context, not template
// data.
const PATH = /^(?!this(?:\.|$))[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/

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

/**
 * A block open: {{#if x}}, {{#unless x}}, {{#each x}}, {{#with x}} or a section {{#x}}.
 * Returns whether the block renders against the value it is given (#each, #with) rather than the
 * data around it. `into` is null when the block's own name belongs to an enclosing item.
 */
function collectBlockOpen(inner: string, into: VariableCollector | null): boolean {
  const tokens = inner.slice(1).trim().split(/\s+/)
  const helper = tokens[0]

  if (BLOCK_HELPERS.has(helper) && tokens.length > 1) {
    if (helper === 'if' || helper === 'unless') {
      into?.add(tokens.at(-1) as string, 'tested')
      return false
    }
    // #each / #with take a value rather than a condition, so it counts as printed. The value
    // comes first; `as |item|` block parameters may follow it.
    into?.add(tokens[1], 'printed')
    return true
  }

  // Mustache section / inverted section: the token itself is the variable
  into?.add(helper.replace(/^&/, ''), 'tested')
  return false
}

/** Plain interpolation, possibly a helper call: {{x}}, {{& x}}, {{formatDate x}}. */
function collectInterpolation(inner: string, into: VariableCollector | null): void {
  const tokens = inner.replace(/^&\s*/, '').split(/\s+/)
  if (tokens.length === 1) {
    into?.add(tokens[0], 'printed')
    return
  }

  // Helper invocation - treat the arguments as variables
  for (const token of tokens.slice(1)) {
    into?.add(token.replace(/^&/, ''), 'printed')
  }
}

/** Where a tag's names go: nowhere when an enclosing block renders against its own item. */
function targetFor(blocks: boolean[], into: VariableCollector): VariableCollector | null {
  return blocks.includes(true) ? null : into
}

/**
 * A close tag or an else - {{/x}}, {{else}}, {{^}} or {{else if x}} - which changes the data the
 * tags after it read. Returns whether `inner` was one.
 */
function applyBlockBoundary(inner: string, blocks: boolean[], into: VariableCollector): boolean {
  if (inner.startsWith('/')) {
    blocks.pop()
    return true
  }
  if (inner !== 'else' && inner !== '^' && !inner.startsWith('else ')) return false

  // An else branch renders against the outer data, as when an #each list is empty.
  if (blocks.length > 0) blocks[blocks.length - 1] = false
  // {{else if x}} continues the chain, so `x` is tested just as in the block it follows.
  const chained = inner.startsWith('else ') ? inner.slice('else '.length).trim() : ''
  if (chained) collectBlockOpen(`#${chained}`, targetFor(blocks, into))
  return true
}

/**
 * Handlebars / Mustache / MJML syntax: {{ var }} and {{{ var }}}.
 *
 * Handlebars renders an #each or #with block against the item it is given, so names inside one
 * are the item's, not template data, and get no input. Mustache looks a name up through every
 * enclosing section, so it has no such scope and its names are always collected.
 */
function collectMustache(body: string, into: VariableCollector, isHandlebars: boolean): void {
  // One entry per open block, innermost last: whether it renders against its own item.
  const blocks: boolean[] = []

  for (const tag of mustacheTagContents(body)) {
    const inner = tag.trim()
    // Empty, a comment or a partial: no variable of its own.
    if (!inner || inner.startsWith('!') || inner.startsWith('>')) continue
    if (applyBlockBoundary(inner, blocks, into)) continue

    // A tag inside an item scope is still read, for the blocks it opens.
    const target = targetFor(blocks, into)
    if (inner.startsWith('#') || inner.startsWith('^')) {
      blocks.push(collectBlockOpen(inner, target) && isHandlebars)
    } else {
      collectInterpolation(inner, target)
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
  collectMustache(body, collector, engine !== TemplateEngine.MUSTACHE)

  return collector.toList()
}
