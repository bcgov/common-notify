import { describe, expect, it } from 'vitest'
import { describeTemplatePlaceholders } from './template-personalisation-validation'
import type { Template } from '../../api/templates/entities/template.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'

function template(
  body: string,
  subject?: string,
  engineCode = TemplateEngine.HANDLEBARS,
): Template {
  return {
    body,
    subject,
    engineCode,
    channelCode: NotificationChannel.EMAIL,
  } as unknown as Template
}

describe('describeTemplatePlaceholders', () => {
  it('returns the leaf a person fills in, not the root the API validates', () => {
    const { paths } = describeTemplatePlaceholders(template('Hello {{recipient.firstName}}'))

    expect(paths).toEqual(['recipient.firstName'])
  })

  it('includes subject placeholders for email templates', () => {
    const { paths } = describeTemplatePlaceholders(
      template('Hello {{recipient.firstName}}', 'Alert {{alert.id}}'),
    )

    expect(paths).toEqual(expect.arrayContaining(['recipient.firstName', 'alert.id']))
  })

  it('treats an if condition as a value that still has to be supplied', () => {
    const { paths, unsupported } = describeTemplatePlaceholders(
      template('{{#if alert.roadClosed}}Closed: {{alert.roadName}}{{/if}}'),
    )

    expect(paths).toEqual(expect.arrayContaining(['alert.roadClosed', 'alert.roadName']))
    expect(unsupported).toEqual([])
  })

  it('reports an each block as unsupported and does not mine its body for columns', () => {
    const { paths, unsupported } = describeTemplatePlaceholders(
      template('{{#each moose}}{{description}} {{behaviour}}{{/each}}'),
    )

    expect(unsupported).toEqual(['moose'])
    expect(paths).toEqual([])
  })

  it('reports a with block as unsupported', () => {
    const { unsupported } = describeTemplatePlaceholders(template('{{#with alert}}{{id}}{{/with}}'))

    expect(unsupported).toEqual(['alert'])
  })

  it('never offers this or @index as a column', () => {
    const { paths } = describeTemplatePlaceholders(template('{{this}} {{@index}} {{firstName}}'))

    expect(paths).toEqual(['firstName'])
  })

  it('describes the moose alert template the way the bulk screen needs', () => {
    const { paths, unsupported } = describeTemplatePlaceholders(
      template(
        `**Alert ID:** {{alert.id}}
Hello **{{recipient.firstName}}**,
{{#if alert.roadClosed}}Closed: {{alert.roadName}}{{/if}}
{{#each recommendations}}- {{this}}{{/each}}
{{#each moose}}{{description}}{{/each}}
**{{contact.name}}** {{contact.phone}}`,
      ),
    )

    expect(paths).toEqual([
      'alert.id',
      'recipient.firstName',
      'alert.roadClosed',
      'alert.roadName',
      'contact.name',
      'contact.phone',
    ])
    expect(unsupported).toEqual(['recommendations', 'moose'])
  })

  it('treats legacy GC Notify placeholders as flat leaves', () => {
    const { paths, unsupported } = describeTemplatePlaceholders(
      template(
        'Hello ((firstName)) ((showDetail??shown))',
        undefined,
        TemplateEngine.LEGACY_GC_NOTIFY,
      ),
    )

    expect(paths).toEqual(expect.arrayContaining(['firstName', 'showDetail']))
    expect(unsupported).toEqual([])
  })

  it('reports a mustache section as unsupported', () => {
    const { paths, unsupported } = describeTemplatePlaceholders(
      template('{{person.name}}{{#items}}{{label}}{{/items}}', undefined, TemplateEngine.MUSTACHE),
    )

    expect(paths).toEqual(expect.arrayContaining(['person.name']))
    expect(unsupported).toEqual(['items'])
  })
})
