import { BadRequestException } from '@nestjs/common'
import Handlebars from 'handlebars'
import Mustache from 'mustache'
import { TemplateEngine } from '../../../enum/template-engine.enum'
import { describeError } from '../../../common/utils/describe-error'

export type TemplateField = 'subject' | 'body'

export class TemplateRenderError extends BadRequestException {}

/** Handlebars' own helpers. No others can exist: renderers reject `registerHelper`. */
const BUILT_IN_HELPERS = new Set(['if', 'unless', 'each', 'with', 'lookup', 'log'])

/**
 * A readable description of what's wrong with a Handlebars template, or undefined if it's valid.
 * Also catches placeholders like `{{first name}}`, which parse fine but fail on every render.
 */
export function findHandlebarsSyntaxProblem(
  text: string | undefined,
  field: TemplateField,
): string | undefined {
  if (!text) return undefined

  let ast: ReturnType<typeof Handlebars.parse>
  try {
    ast = Handlebars.parse(text)
  } catch (error) {
    return describeHandlebarsParseError(error, field)
  }
  return findUnknownHelperCall(ast, text, field)
}

/**
 * Handlebars' parser reports "Parse error on line N:", the text before the error, a caret line
 * and a list of expected tokens. Keep the line and the text; the tokens mean nothing to an author.
 */
function describeHandlebarsParseError(error: unknown, field: TemplateField): string {
  const message = describeError(error)
  const parseError = /^Parse error on line (\d+):\n(.*)\n/.exec(message)
  if (!parseError) return `Invalid template syntax in ${field}: ${firstLine(error)}`
  return (
    `Invalid template syntax in ${field} on line ${parseError[1]}, near "${parseError[2].trim()}": ` +
    'check that every {{ has a matching }} and every {{#block}} is closed with {{/block}}.'
  )
}

/** Why Mustache cannot parse `text` (an unclosed tag or section), or undefined if it can. */
export function findMustacheSyntaxProblem(
  text: string | undefined,
  field: TemplateField,
): string | undefined {
  if (!text) return undefined
  try {
    Mustache.parse(text)
    return undefined
  } catch (error) {
    return `Invalid template syntax in ${field}: ${firstLine(error)}`
  }
}

/** The syntax check for a template engine. The GC Notify engines substitute by pattern and never throw. */
export function findTemplateSyntaxProblem(
  engineCode: TemplateEngine | string | undefined,
  text: string | undefined,
  field: TemplateField,
): string | undefined {
  switch (engineCode) {
    case TemplateEngine.HANDLEBARS:
    case TemplateEngine.MJML:
      return findHandlebarsSyntaxProblem(text, field)
    case TemplateEngine.MUSTACHE:
      return findMustacheSyntaxProblem(text, field)
    default:
      return undefined
  }
}

function findUnknownHelperCall(node: any, text: string, field: TemplateField): string | undefined {
  if (!node || typeof node !== 'object') return undefined

  if (
    (node.type === 'MustacheStatement' ||
      node.type === 'BlockStatement' ||
      node.type === 'SubExpression') &&
    node.path?.type === 'PathExpression' &&
    (node.params?.length > 0 || node.hash) &&
    !BUILT_IN_HELPERS.has(node.path.original)
  ) {
    return describeUnknownHelperCall(node, text, field)
  }

  const children = [
    ...(node.body ?? []),
    ...(node.params ?? []),
    ...(node.hash?.pairs?.map((pair: any) => pair.value) ?? []),
    node.program,
    node.inverse,
  ]
  for (const child of children) {
    const problem = findUnknownHelperCall(child, text, field)
    if (problem) return problem
  }
  return undefined
}

function describeUnknownHelperCall(node: any, text: string, field: TemplateField): string {
  const tag = sourceOf(node, text)
  const words = [node.path, ...node.params]
  if (!node.hash && words.every((word) => word.type === 'PathExpression')) {
    const suggestion = words.map((word) => word.original).join('_')
    return `Placeholder ${tag} in ${field} contains a space — use {{${suggestion}}}`
  }
  return (
    `Placeholder ${tag} in ${field} is not valid Handlebars: "${node.path.original}" is not a ` +
    'helper. Use {{#if}}…{{else}}…{{/if}} for conditions.'
  )
}

/**
 * The original template text for a node, e.g. `{{first name}}`. For a block, only the opening
 * tag is returned, since the block's location covers its whole body.
 */
function sourceOf(node: any, text: string): string {
  const lines = text.split('\n')

  // Handlebars positions are { line (1-based), column (0-based) }; convert to a string index.
  const toIndex = ({ line, column }: { line: number; column: number }): number => {
    let index = column
    for (let i = 0; i < line - 1; i++) {
      index += lines[i].length + 1 // +1 for the newline
    }
    return index
  }

  const source = text.slice(toIndex(node.loc.start), toIndex(node.loc.end))
  if (node.type !== 'BlockStatement') return source

  const openingTagEnd = source.indexOf('}}')
  return openingTagEnd === -1 ? source : source.slice(0, openingTagEnd + 2)
}

function firstLine(error: unknown): string {
  const message = describeError(error)
  return message.split('\n')[0]
}

/** Renders with Handlebars, turning its errors into a TemplateRenderError that names the problem. */
export function renderHandlebars(
  text: string,
  data: unknown,
  field: TemplateField,
  options?: CompileOptions,
): string {
  try {
    return Handlebars.compile(text, options)(data)
  } catch (error) {
    throw new TemplateRenderError(
      findHandlebarsSyntaxProblem(text, field) ??
        `Could not render template ${field}: ${firstLine(error)}`,
    )
  }
}

/** Renders with Mustache, turning its errors into a TemplateRenderError that names the problem. */
export function renderMustache(
  text: string,
  view: unknown,
  field: TemplateField,
  config?: Parameters<typeof Mustache.render>[3],
): string {
  try {
    return Mustache.render(text, view, {}, config)
  } catch (error) {
    throw new TemplateRenderError(
      findMustacheSyntaxProblem(text, field) ??
        `Could not render template ${field}: ${firstLine(error)}`,
    )
  }
}
