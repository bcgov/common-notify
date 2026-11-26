import { describe, it, expect } from 'vitest'
import {
  findHandlebarsSyntaxProblem,
  findMustacheSyntaxProblem,
  findTemplateSyntaxProblem,
  renderHandlebars,
  TemplateRenderError,
} from './template-syntax'
import { TemplateEngine } from '../../../enum/template-engine.enum'

describe('findHandlebarsSyntaxProblem', () => {
  it.each([
    'Hi {{name}}',
    'Hi {{{html}}}',
    '{{#if a}}yes{{else if b}}maybe{{else}}no{{/if}}',
    '{{#unless a}}none{{/unless}}',
    '{{#each items}}{{this}} {{@index}}{{/each}}',
    '{{#with user}}{{name}}{{/with}}',
    '{{lookup dates key}}',
    '{{#if (lookup flags key)}}on{{/if}}',
    '{{user.firstName}}',
    '',
  ])('accepts %j', (text) => {
    expect(findHandlebarsSyntaxProblem(text, 'body')).toBeUndefined()
  })

  it('suggests an underscore for a placeholder with a space', () => {
    expect(findHandlebarsSyntaxProblem('Hi {{first name}}!', 'body')).toBe(
      'Placeholder {{first name}} in body contains a space — use {{first_name}}',
    )
  })

  it('quotes the placeholder from a later line', () => {
    expect(findHandlebarsSyntaxProblem('Hello\n  {{ first  name }}', 'subject')).toBe(
      'Placeholder {{ first  name }} in subject contains a space — use {{first_name}}',
    )
  })

  it('finds a placeholder with a space inside a block', () => {
    expect(findHandlebarsSyntaxProblem('{{#if a}}Hi {{first name}}{{/if}}', 'body')).toBe(
      'Placeholder {{first name}} in body contains a space — use {{first_name}}',
    )
  })

  it('explains that a ternary is not Handlebars', () => {
    expect(findHandlebarsSyntaxProblem("{{ a ? 'yes' : 'no' }}", 'subject')).toBe(
      `Placeholder {{ a ? 'yes' : 'no' }} in subject is not valid Handlebars: "a" is not a ` +
        'helper. Use {{#if}}…{{else}}…{{/if}} for conditions.',
    )
  })

  it('quotes only the opening tag of a block with an unknown helper', () => {
    expect(findHandlebarsSyntaxProblem('{{#ifEquals a "x"}}yes{{/ifEquals}}', 'body')).toBe(
      'Placeholder {{#ifEquals a "x"}} in body is not valid Handlebars: "ifEquals" is not a ' +
        'helper. Use {{#if}}…{{else}}…{{/if}} for conditions.',
    )
  })

  it('reports an unclosed block without the parser token list', () => {
    expect(findHandlebarsSyntaxProblem('Hi {{#if x}}open', 'body')).toBe(
      'Invalid template syntax in body on line 1, near "Hi {{#if x}}open": check that every ' +
        '{{ has a matching }} and every {{#block}} is closed with {{/block}}.',
    )
  })

  it('reports a mismatched block close', () => {
    expect(findHandlebarsSyntaxProblem('{{#if a}}x{{/each}}', 'body')).toBe(
      "Invalid template syntax in body: if doesn't match each - 1:3",
    )
  })
})

describe('findMustacheSyntaxProblem', () => {
  it('accepts a key with a space, which Mustache looks up as written', () => {
    expect(findMustacheSyntaxProblem('Hi {{first name}}', 'body')).toBeUndefined()
  })

  it('reports an unclosed section', () => {
    expect(findMustacheSyntaxProblem('Hi {{#a}}x', 'body')).toBe(
      'Invalid template syntax in body: Unclosed section "a" at 10',
    )
  })
})

describe('findTemplateSyntaxProblem', () => {
  it.each([TemplateEngine.HANDLEBARS, TemplateEngine.MJML])('checks %s as Handlebars', (engine) => {
    expect(findTemplateSyntaxProblem(engine, 'Hi {{first name}}', 'body')).toContain(
      'contains a space',
    )
  })

  it.each([TemplateEngine.LEGACY_GC_NOTIFY, TemplateEngine.GC_NOTIFY_NATIVE])(
    'leaves %s alone',
    (engine) => {
      expect(findTemplateSyntaxProblem(engine, 'Hi {{first name}} {{#if', 'body')).toBeUndefined()
    },
  )
})

describe('renderHandlebars', () => {
  it('renders a valid template', () => {
    expect(renderHandlebars('Hi {{name}}', { name: 'Bob' }, 'body')).toBe('Hi Bob')
  })

  it('throws a TemplateRenderError, a 400, naming the problem', () => {
    let thrown: unknown
    try {
      renderHandlebars('Hi {{first name}}', { first: 'Bob' }, 'body')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(TemplateRenderError)
    expect((thrown as TemplateRenderError).getStatus()).toBe(400)
    expect((thrown as Error).message).toBe(
      'Placeholder {{first name}} in body contains a space — use {{first_name}}',
    )
  })

  it('falls back to the engine message for a runtime error the syntax check cannot see', () => {
    expect(() => renderHandlebars('Hi {{> missing}}', {}, 'body')).toThrow(
      'Could not render template body: The partial missing could not be found',
    )
  })
})
