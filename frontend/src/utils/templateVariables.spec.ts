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

  it('detects Handlebars blocks and helpers, ignoring dotted paths', () => {
    // Dotted paths (user.createdAt) are excluded: the renderer receives a flat
    // params object, so a nested lookup can never bind and would render empty.
    expect(
      detectVariables(
        'Hi {{firstName}} {{#if hasUpdates}}updates{{/if}} {{formatDate user.createdAt}}',
        TemplateEngine.HANDLEBARS,
      ),
    ).toEqual([
      { name: 'firstName', type: 'text' },
      { name: 'hasUpdates', type: 'boolean' },
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
