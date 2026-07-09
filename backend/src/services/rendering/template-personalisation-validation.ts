import Handlebars from 'handlebars'
import type { Template } from '../../api/templates/entities/template.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const HANDLEBARS_CONTROL_NAMES = new Set(['if', 'each', 'unless', 'with', 'else'])
const LEGACY_GC_NOTIFY_PLACEHOLDER_REGEX = /\(\(([a-zA-Z_][a-zA-Z0-9_]*)(?:\?\?[^)]*)?\)\)/g
const MUSTACHE_TAG_REGEX =
  /\{\{(#|\^|&)?\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[^}\s]+)?\s*\}\}|\{\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[^}\s]+)?\s*\}\}\}/g

export function extractTemplatePersonalisationKeys(template: Template): string[] {
  const placeholders = new Set<string>()

  addPlaceholders(placeholders, extractPlaceholdersForEngine(template.engineCode, template.body))

  if (template.channelCode === NotificationChannel.EMAIL) {
    addPlaceholders(
      placeholders,
      extractPlaceholdersForEngine(template.engineCode, template.subject),
    )
  }

  return [...placeholders]
}

function extractPlaceholdersForEngine(
  engineCode: TemplateEngine | string,
  text?: string,
): string[] {
  switch (engineCode) {
    case TemplateEngine.LEGACY_GC_NOTIFY:
      return extractLegacyGcNotifyPlaceholders(text)
    case TemplateEngine.HANDLEBARS:
    case TemplateEngine.MJML:
      return extractHandlebarsStylePlaceholders(text)
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

function extractHandlebarsStylePlaceholders(text?: string): string[] {
  if (!text) {
    return []
  }

  const placeholders = new Set<string>()
  const ast = Handlebars.parse(text) as any

  visitHandlebarsNode(ast, placeholders, 0)

  return [...placeholders]
}

function visitHandlebarsNode(node: any, placeholders: Set<string>, scopedDepth: number): void {
  if (!node || typeof node !== 'object') {
    return
  }

  switch (node.type) {
    case 'Program':
      for (const child of node.body || []) {
        visitHandlebarsNode(child, placeholders, scopedDepth)
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
      visitHandlebarsNode(node.program, placeholders, nextScopedDepth)
      visitHandlebarsNode(node.inverse, placeholders, scopedDepth)
      return
    }
    case 'PartialStatement':
    case 'PartialBlockStatement':
      for (const param of node.params || []) {
        collectHandlebarsExpression(param, placeholders, scopedDepth)
      }
      collectHandlebarsHash(node.hash, placeholders, scopedDepth)
      visitHandlebarsNode(node.program, placeholders, scopedDepth)
      return
    case 'SubExpression':
      collectHandlebarsReference(node, placeholders, scopedDepth)
      return
    default:
      return
  }
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

  for (const match of text.matchAll(MUSTACHE_TAG_REGEX)) {
    const key = match[2] || match[3]
    if (key) {
      addPlaceholder(placeholders, key)
    }
  }

  return [...placeholders]
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
