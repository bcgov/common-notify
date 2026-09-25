import Handlebars from 'handlebars'
import Mustache from 'mustache'
import type { Template } from '../../api/templates/entities/template.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const HANDLEBARS_CONTROL_NAMES = new Set(['if', 'each', 'unless', 'with', 'else'])
const LEGACY_GC_NOTIFY_PLACEHOLDER_REGEX = /\(\(([a-zA-Z_][a-zA-Z0-9_]*)(?:\?\?[^)]*)?\)\)/g

type MustacheToken = [string, string, number?, number?, MustacheToken[]?]

export function extractTemplatePersonalisationKeys(
  template: Template,
  personalisation?: Record<string, unknown>,
): string[] {
  const placeholders = new Set<string>()

  addPlaceholders(
    placeholders,
    extractPlaceholdersForEngine(template.engineCode, template.body, personalisation),
  )

  if (template.channelCode === NotificationChannel.EMAIL) {
    addPlaceholders(
      placeholders,
      extractPlaceholdersForEngine(template.engineCode, template.subject, personalisation),
    )
  }

  return [...placeholders]
}

function extractPlaceholdersForEngine(
  engineCode: TemplateEngine | string,
  text?: string,
  personalisation?: Record<string, unknown>,
): string[] {
  switch (engineCode) {
    case TemplateEngine.LEGACY_GC_NOTIFY:
      return extractLegacyGcNotifyPlaceholders(text)
    case TemplateEngine.HANDLEBARS:
    case TemplateEngine.MJML:
      return extractHandlebarsStylePlaceholders(text, personalisation)
    case TemplateEngine.MUSTACHE:
      return extractMustachePlaceholders(text)
    default:
      return []
  }
}

function extractLegacyGcNotifyPlaceholders(text?: string): string[] {
  if (!text) {
    return []
  }

  const placeholders = new Set<string>()

  for (const match of text.matchAll(LEGACY_GC_NOTIFY_PLACEHOLDER_REGEX)) {
    addPlaceholder(placeholders, match[1])
  }

  return [...placeholders]
}

function extractHandlebarsStylePlaceholders(
  text?: string,
  personalisation?: Record<string, unknown>,
): string[] {
  if (!text) {
    return []
  }

  const placeholders = new Set<string>()
  const ast = Handlebars.parse(text) as any

  visitHandlebarsNode(ast, placeholders, 0, personalisation)

  return [...placeholders]
}

function visitHandlebarsNode(
  node: any,
  placeholders: Set<string>,
  scopedDepth: number,
  personalisation?: Record<string, unknown>,
): void {
  if (!node || typeof node !== 'object') {
    return
  }

  switch (node.type) {
    case 'Program':
      for (const child of node.body || []) {
        visitHandlebarsNode(child, placeholders, scopedDepth, personalisation)
      }
      return
    case 'MustacheStatement':
      collectHandlebarsReference(node, placeholders, scopedDepth)
      return
    case 'BlockStatement': {
      const helperName = getHandlebarsPathName(node.path)
      const nextScopedDepth =
        helperName === 'with' || helperName === 'each' ? scopedDepth + 1 : scopedDepth

      collectHandlebarsReference(node, placeholders, scopedDepth)
      const selectedConditionalBranch = selectHandlebarsConditionalBranch(
        node,
        helperName,
        scopedDepth,
        personalisation,
      )

      if (selectedConditionalBranch === 'program') {
        visitHandlebarsNode(node.program, placeholders, nextScopedDepth, personalisation)
      } else if (selectedConditionalBranch === 'inverse') {
        visitHandlebarsNode(node.inverse, placeholders, scopedDepth, personalisation)
      } else {
        visitHandlebarsNode(node.program, placeholders, nextScopedDepth, personalisation)
        visitHandlebarsNode(node.inverse, placeholders, scopedDepth, personalisation)
      }
      return
    }
    case 'PartialStatement':
    case 'PartialBlockStatement':
      for (const param of node.params || []) {
        collectHandlebarsExpression(param, placeholders, scopedDepth)
      }
      collectHandlebarsHash(node.hash, placeholders, scopedDepth)
      visitHandlebarsNode(node.program, placeholders, scopedDepth, personalisation)
      return
    case 'SubExpression':
      collectHandlebarsReference(node, placeholders, scopedDepth)
      return
    default:
      return
  }
}

function selectHandlebarsConditionalBranch(
  node: any,
  helperName: string | undefined,
  scopedDepth: number,
  personalisation?: Record<string, unknown>,
): 'program' | 'inverse' | undefined {
  if ((helperName !== 'if' && helperName !== 'unless') || scopedDepth !== 0 || !personalisation) {
    return undefined
  }

  const condition = node.params?.[0]
  if (condition?.type !== 'PathExpression' || condition.depth !== 0 || condition.data) {
    return undefined
  }

  const resolved = resolveOwnPath(personalisation, condition.original)
  if (!resolved.found) {
    return undefined
  }

  const includeZero = node.hash?.pairs?.some(
    (pair: any) => pair.key === 'includeZero' && pair.value?.value === true,
  )
  const conditionIsTruthy =
    (includeZero && resolved.value === 0) || !Handlebars.Utils.isEmpty(resolved.value)
  const rendersProgram = helperName === 'if' ? conditionIsTruthy : !conditionIsTruthy

  return rendersProgram ? 'program' : 'inverse'
}

function resolveOwnPath(
  personalisation: Record<string, unknown>,
  path: unknown,
): { found: boolean; value?: unknown } {
  if (typeof path !== 'string' || !path) {
    return { found: false }
  }

  let current: unknown = personalisation
  for (const segment of path.split('.')) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { found: false }
    }
    current = (current as Record<string, unknown>)[segment]
  }

  return { found: true, value: current }
}

function collectHandlebarsReference(
  node: any,
  placeholders: Set<string>,
  scopedDepth: number,
): void {
  const pathName = getHandlebarsPathName(node.path)
  const hasArguments = (node.params?.length ?? 0) > 0 || (node.hash?.pairs?.length ?? 0) > 0

  if (
    pathName &&
    !HANDLEBARS_CONTROL_NAMES.has(pathName) &&
    !hasArguments &&
    shouldCollectHandlebarsPath(node.path, scopedDepth)
  ) {
    addPlaceholder(placeholders, pathName)
  }

  for (const param of node.params || []) {
    collectHandlebarsExpression(param, placeholders, scopedDepth)
  }

  collectHandlebarsHash(node.hash, placeholders, scopedDepth)
}

function collectHandlebarsExpression(
  expression: any,
  placeholders: Set<string>,
  scopedDepth: number,
): void {
  if (!expression || typeof expression !== 'object') {
    return
  }

  switch (expression.type) {
    case 'PathExpression':
      if (shouldCollectHandlebarsPath(expression, scopedDepth)) {
        addPlaceholder(placeholders, getHandlebarsPathName(expression))
      }
      return
    case 'SubExpression':
      collectHandlebarsReference(expression, placeholders, scopedDepth)
      return
    default:
      return
  }
}

function collectHandlebarsHash(hash: any, placeholders: Set<string>, scopedDepth: number): void {
  for (const pair of hash?.pairs || []) {
    collectHandlebarsExpression(pair.value, placeholders, scopedDepth)
  }
}

function shouldCollectHandlebarsPath(path: any, scopedDepth: number): boolean {
  const depth = typeof path?.depth === 'number' ? path.depth : 0

  if (scopedDepth === 0) {
    return true
  }

  return depth > 0
}

function getHandlebarsPathName(path: any): string | undefined {
  const original = typeof path?.original === 'string' ? path.original : ''
  if (!original || original === 'this' || original.startsWith('@')) {
    return undefined
  }

  const [root] = original.split('.')
  return IDENTIFIER_REGEX.test(root) ? root : undefined
}

function extractMustachePlaceholders(text?: string): string[] {
  if (!text) {
    return []
  }

  const placeholders = new Set<string>()
  const tokens = Mustache.parse(text) as MustacheToken[]

  collectMustacheTokens(tokens, placeholders, 0)

  return [...placeholders]
}

function collectMustacheTokens(
  tokens: MustacheToken[],
  placeholders: Set<string>,
  scopedDepth: number,
): void {
  for (const token of tokens) {
    const [type, value, , , children] = token
    const rootName = getScopedIdentifier(value)

    switch (type) {
      case 'name':
      case '&':
      case '{':
        if (rootName && scopedDepth === 0) {
          addPlaceholder(placeholders, rootName)
        }
        break
      case '#':
      case '^':
        if (rootName && scopedDepth === 0) {
          addPlaceholder(placeholders, rootName)
        }
        if (Array.isArray(children)) {
          collectMustacheTokens(children, placeholders, scopedDepth + 1)
        }
        break
      default:
        break
    }
  }
}

function getScopedIdentifier(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === '.' || trimmed.startsWith('@') || trimmed.startsWith('/')) {
    return undefined
  }

  const normalized = trimmed.replace(/^\.\//, '')
  const [root] = normalized.split('.')

  return IDENTIFIER_REGEX.test(root) ? root : undefined
}

function addPlaceholders(target: Set<string>, values: string[]): void {
  for (const value of values) {
    target.add(value)
  }
}

function addPlaceholder(placeholders: Set<string>, value?: string): void {
  if (value && IDENTIFIER_REGEX.test(value)) {
    placeholders.add(value)
  }
}

/**
 * What a bulk (CSV) send needs to know about a template.
 *
 * `extractTemplatePersonalisationKeys` answers "which top-level keys must the caller supply", which
 * is the right question for validating an API request. A spreadsheet asks a different one: it needs
 * the *leaf* a person types into a cell (`alert.id`, not `alert`), and it needs to know when a
 * template cannot be served from a flat file at all.
 */
export interface TemplatePlaceholderReport {
  /** Full dotted paths a person fills in, one column each - e.g. `alert.id`, `recipient.firstName`. */
  paths: string[]
  /**
   * Placeholders that repeat or re-scope (`{{#each x}}`, `{{#with x}}`). One spreadsheet row holds
   * scalars, so a template that iterates a list cannot be driven from a CSV.
   */
  unsupported: string[]
}

/** Describe a template's placeholders for the bulk-send screen. */
export function describeTemplatePlaceholders(template: Template): TemplatePlaceholderReport {
  const paths = new Set<string>()
  const unsupported = new Set<string>()

  const sources = [template.body]
  if (template.channelCode === NotificationChannel.EMAIL) {
    sources.push(template.subject)
  }

  for (const source of sources) {
    describePlaceholdersForEngine(template.engineCode, source, paths, unsupported)
  }

  return { paths: [...paths], unsupported: [...unsupported] }
}

function describePlaceholdersForEngine(
  engineCode: TemplateEngine | string,
  text: string | undefined,
  paths: Set<string>,
  unsupported: Set<string>,
): void {
  if (!text) {
    return
  }

  switch (engineCode) {
    case TemplateEngine.LEGACY_GC_NOTIFY:
      // Legacy syntax has no nesting or iteration, so every placeholder is already a leaf.
      for (const name of extractLegacyGcNotifyPlaceholders(text)) {
        paths.add(name)
      }
      return
    case TemplateEngine.HANDLEBARS:
    case TemplateEngine.MJML:
      describeHandlebarsNode(Handlebars.parse(text) as any, paths, unsupported, 0)
      return
    case TemplateEngine.MUSTACHE:
      describeMustacheTokens(Mustache.parse(text) as MustacheToken[], paths, unsupported)
      return
    default:
      return
  }
}

function describeHandlebarsNode(
  node: any,
  paths: Set<string>,
  unsupported: Set<string>,
  scopedDepth: number,
): void {
  if (!node || typeof node !== 'object') {
    return
  }

  switch (node.type) {
    case 'Program':
      for (const child of node.body || []) {
        describeHandlebarsNode(child, paths, unsupported, scopedDepth)
      }
      return
    case 'MustacheStatement':
      addHandlebarsLeaf(node.path, paths, scopedDepth)
      for (const param of node.params || []) {
        addHandlebarsLeaf(param, paths, scopedDepth)
      }
      return
    case 'BlockStatement': {
      const helperName = getHandlebarsPathName(node.path)

      if (helperName === 'each' || helperName === 'with') {
        // The body is evaluated against each item / the scoped object, so its references cannot be
        // mapped to spreadsheet columns. Record the iterated value and stop descending.
        for (const param of node.params || []) {
          const name = getHandlebarsLeafName(param)
          if (name) unsupported.add(name)
        }
        return
      }

      // `if` / `unless` conditions are values a person still has to supply.
      for (const param of node.params || []) {
        addHandlebarsLeaf(param, paths, scopedDepth)
      }
      describeHandlebarsNode(node.program, paths, unsupported, scopedDepth)
      describeHandlebarsNode(node.inverse, paths, unsupported, scopedDepth)
      return
    }
    default:
      return
  }
}

function addHandlebarsLeaf(path: any, paths: Set<string>, scopedDepth: number): void {
  if (!shouldCollectHandlebarsPath(path, scopedDepth)) {
    return
  }

  const name = getHandlebarsLeafName(path)
  if (name) {
    paths.add(name)
  }
}

/**
 * The full dotted path, unlike {@link getHandlebarsPathName} which returns only its root.
 *
 * Helper names (`if`, `each`, ...), `this` and `@`-prefixed data variables are not values anyone
 * supplies, so they are excluded.
 */
function getHandlebarsLeafName(path: any): string | undefined {
  if (path?.type !== 'PathExpression') {
    return undefined
  }

  const original = typeof path.original === 'string' ? path.original : ''
  if (!original || original === 'this' || original.startsWith('@') || original.startsWith('.')) {
    return undefined
  }

  const segments = original.split('.')
  if (!segments.every((segment) => IDENTIFIER_REGEX.test(segment))) {
    return undefined
  }
  if (segments.length === 1 && HANDLEBARS_CONTROL_NAMES.has(segments[0])) {
    return undefined
  }

  return original
}

function describeMustacheTokens(
  tokens: MustacheToken[],
  paths: Set<string>,
  unsupported: Set<string>,
): void {
  for (const token of tokens) {
    const [type, value] = token

    if (type === 'name' || type === '&') {
      const segments = value.split('.')
      if (value !== '.' && segments.every((segment) => IDENTIFIER_REGEX.test(segment))) {
        paths.add(value)
      }
      continue
    }

    // A mustache section is either an iteration or a scope change; neither survives flattening.
    if (type === '#' || type === '^') {
      if (IDENTIFIER_REGEX.test(value.split('.')[0])) {
        unsupported.add(value)
      }
    }
  }
}
