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

  visitHandlebarsNode(ast, placeholders)

  return [...placeholders]
}

function visitHandlebarsNode(node: any, placeholders: Set<string>): void {
  if (!node || typeof node !== 'object') {
    return
  }

  switch (node.type) {
    case 'Program':
      for (const child of node.body || []) {
        visitHandlebarsNode(child, placeholders)
      }
      return
    case 'MustacheStatement':
      collectHandlebarsReference(node, placeholders)
      return
    case 'BlockStatement':
      collectHandlebarsReference(node, placeholders)
      visitHandlebarsNode(node.program, placeholders)
      visitHandlebarsNode(node.inverse, placeholders)
      return
    case 'PartialStatement':
    case 'PartialBlockStatement':
      for (const param of node.params || []) {
        collectHandlebarsExpression(param, placeholders)
      }
      collectHandlebarsHash(node.hash, placeholders)
      visitHandlebarsNode(node.program, placeholders)
      return
    case 'SubExpression':
      collectHandlebarsReference(node, placeholders)
      return
    default:
      return
  }
}

function collectHandlebarsReference(node: any, placeholders: Set<string>): void {
  const pathName = getHandlebarsPathName(node.path)
  const hasArguments = (node.params?.length ?? 0) > 0 || (node.hash?.pairs?.length ?? 0) > 0

  if (pathName && !HANDLEBARS_CONTROL_NAMES.has(pathName) && !hasArguments) {
    addPlaceholder(placeholders, pathName)
  }

  for (const param of node.params || []) {
    collectHandlebarsExpression(param, placeholders)
  }

  collectHandlebarsHash(node.hash, placeholders)
}

function collectHandlebarsExpression(expression: any, placeholders: Set<string>): void {
  if (!expression || typeof expression !== 'object') {
    return
  }

  switch (expression.type) {
    case 'PathExpression':
      addPlaceholder(placeholders, getHandlebarsPathName(expression))
      return
    case 'SubExpression':
      collectHandlebarsReference(expression, placeholders)
      return
    default:
      return
  }
}

function collectHandlebarsHash(hash: any, placeholders: Set<string>): void {
  for (const pair of hash?.pairs || []) {
    collectHandlebarsExpression(pair.value, placeholders)
  }
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
