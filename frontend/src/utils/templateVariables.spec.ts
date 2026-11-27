import { describe, expect, it } from 'vitest'
import { TemplateEngine } from '@/api/templates.api'
import { detectVariables } from './templateVariables'

describe('detectVariables', () => {
  it('detects legacy GC Notify interpolations and conditionals', () => {
    // `name` is printed as well as tested, so it needs a real value; blank hides its section.
    expect(
      detectVariables(
        'Hello ((name))\n((showDetails??Visible content))\n((name??Conditional content))',
        TemplateEngine.LEGACY_GC_NOTIFY,
      ),
    ).toEqual([
      { name: 'name', type: 'text', isOptional: true },
      { name: 'showDetails', type: 'boolean' },
    ])
  })

  it('gives a Handlebars variable that is tested and printed an optional text field', () => {
    expect(
      detectVariables(
        '{{firstName}} {{#if phone}}Phone: {{phone}}{{/if}} {{#if isVip}}VIP{{/if}} ' +
          '{{#unless notes}}None{{/unless}}{{formatNote notes}}',
        TemplateEngine.HANDLEBARS,
      ),
    ).toEqual([
      { name: 'firstName', type: 'text' },
      { name: 'phone', type: 'text', isOptional: true },
      { name: 'isVip', type: 'boolean' },
      { name: 'notes', type: 'text', isOptional: true },
    ])
  })

  it('gives a Mustache section that also prints its variable an optional text field', () => {
    expect(
      detectVariables('{{#phone}}Phone: {{phone}}{{/phone}}', TemplateEngine.MUSTACHE),
    ).toEqual([{ name: 'phone', type: 'text', isOptional: true }])
  })

  it('detects Handlebars blocks and helpers, including dotted paths', () => {
    expect(
      detectVariables(
        'Hi {{firstName}} {{#if hasUpdates}}updates{{/if}} {{formatDate user.createdAt}}',
        TemplateEngine.HANDLEBARS,
      ),
    ).toEqual([
      { name: 'firstName', type: 'text' },
      { name: 'hasUpdates', type: 'boolean' },
      { name: 'user.createdAt', type: 'text' },
    ])
  })

  it.each([TemplateEngine.HANDLEBARS, TemplateEngine.MJML, TemplateEngine.MUSTACHE])(
    'detects dotted paths in %s, skipping this.x and parent or data references',
    (engine) => {
      expect(
        detectVariables(
          '{{user.firstName}} {{#if order.isRush}}rush{{/if}} {{order.address.city}} ' +
            '{{this.name}} {{../title}} {{@root.title}} {{user.}} {{.hidden}}',
          engine,
        ),
      ).toEqual([
        { name: 'user.firstName', type: 'text' },
        { name: 'order.isRush', type: 'boolean' },
        { name: 'order.address.city', type: 'text' },
      ])
    },
  )

  it('does not detect dotted names in legacy GC Notify, which has no path syntax', () => {
    expect(detectVariables('((user.name)) ((name))', TemplateEngine.LEGACY_GC_NOTIFY)).toEqual([
      { name: 'name', type: 'text' },
    ])
  })

  it('reads triple-stash tags and skips unclosed or broken ones', () => {
    expect(
      detectVariables('{{{ rawHtml }}} {{ broken}here}} {{ unclosed', TemplateEngine.HANDLEBARS),
    ).toEqual([{ name: 'rawHtml', type: 'text' }])
  })

  it('takes a legacy tag up to its first closing parens and skips an unclosed one', () => {
    expect(
      detectVariables('((show??a (b) c)) (( spaced )) ((unclosed', TemplateEngine.LEGACY_GC_NOTIFY),
    ).toEqual([
      { name: 'show', type: 'boolean' },
      { name: 'spaced', type: 'text' },
    ])
  })

  it('scans a long run of unclosed tags without stalling', () => {
    const body = '(('.repeat(50_000) + '{{ '.repeat(50_000)
    const started = performance.now()
    detectVariables(body, TemplateEngine.LEGACY_GC_NOTIFY)
    detectVariables(body, TemplateEngine.HANDLEBARS)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('detects Mustache sections and inverted sections as booleans', () => {
    expect(
      detectVariables(
        '{{#items}}{{/items}} {{^isArchived}}hidden{{/isArchived}} {{name}}',
        TemplateEngine.MUSTACHE,
      ),
    ).toEqual([
      { name: 'items', type: 'boolean' },
      { name: 'isArchived', type: 'boolean' },
      { name: 'name', type: 'text' },
    ])
  })
})
