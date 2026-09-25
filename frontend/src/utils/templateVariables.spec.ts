import { describe, expect, it } from 'vitest'
import { TemplateEngine } from '@/api/templates.api'
import { detectVariables } from './templateVariables'

describe('detectVariables', () => {
  it('detects legacy GC Notify interpolations and conditionals', () => {
    expect(
      detectVariables(
        'Hello ((name))\n((showDetails??Visible content))\n((name??Conditional content))',
        TemplateEngine.LEGACY_GC_NOTIFY,
      ),
    ).toEqual([
      { name: 'name', type: 'boolean' },
      { name: 'showDetails', type: 'boolean' },
    ])
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
