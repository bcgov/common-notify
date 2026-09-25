import { Test } from '@nestjs/testing'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { OpenAPIObject } from '@nestjs/swagger'
import { NotifySimpleController } from '../notify.controller'
import { applyNotifySchemaConstraints } from './schema-constraints'

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

async function buildDocument(): Promise<OpenAPIObject> {
  const moduleRef = await Test.createTestingModule({ controllers: [NotifySimpleController] })
    .useMocker(() => ({}))
    .compile()
  return SwaggerModule.createDocument(
    moduleRef.createNestApplication(),
    new DocumentBuilder().build(),
  )
}

describe('applyNotifySchemaConstraints', () => {
  let schemas: Record<string, any>

  beforeAll(async () => {
    schemas = applyNotifySchemaConstraints(await buildDocument()).components!.schemas as Record<
      string,
      any
    >
  })

  // Swagger UI labels a oneOf branch with its schema name only when the branch is a bare $ref.
  it.each([
    ['NotifyEmailChannel', 'content', ['TemplateContent', 'EmailInlineContent']],
    ['NotifyEmailChannel', 'recipients', ['EmailRecipients', 'EmailMailMerge']],
    ['NotifySmsChannel', 'content', ['TemplateContent', 'SmsInlineContent']],
    ['NotifySmsChannel', 'recipients', ['SmsRecipients', 'SmsMailMerge']],
  ])('%s.%s is a oneOf of bare named refs', (channel, property, names) => {
    expect(schemas[channel].properties[property].oneOf).toEqual(names.map(ref))
  })

  // Each branch is closed to its own fields, which is what makes the branches exclusive.
  it.each([
    'EmailRecipients',
    'EmailMailMerge',
    'SmsRecipients',
    'SmsMailMerge',
    'TemplateContent',
    'EmailInlineContent',
    'SmsInlineContent',
  ])('closes %s to its own fields', (name) => {
    expect(schemas[name].additionalProperties).toBe(false)
    expect(schemas[name].not).toBeUndefined()
    expect(schemas[name].anyOf).toBeUndefined()
  })

  it('requires the field that identifies each branch', () => {
    expect(schemas.TemplateContent.required).toEqual(['templateId'])
    expect(schemas.EmailMailMerge.required).toEqual(['mergeArray'])
    expect(schemas.SmsRecipients.required).toEqual(['to'])
    expect(schemas.SmsMailMerge.required).toEqual(['mergeArray'])
  })

  it('requires an addressed email to carry at least one of to/cc/bcc', () => {
    expect(Object.keys(schemas.EmailRecipients.properties)).toEqual(['to', 'cc', 'bcc'])
    expect(schemas.EmailRecipients.minProperties).toBe(1)
    expect(schemas.EmailRecipients.required).toBeUndefined()
  })

  it.each(['EmailInlineContent', 'SmsInlineContent'])('leaves %s requiring nothing', (name) => {
    expect(schemas[name].required).toBeUndefined()
  })

  // The SMS runtime DTO is narrower than the email one, so the published branch is too.
  it('publishes only the fields an SMS channel accepts', () => {
    expect(Object.keys(schemas.SmsInlineContent.properties)).toEqual(['body', 'renderer'])
    expect(Object.keys(schemas.EmailInlineContent.properties)).toEqual([
      'body',
      'subject',
      'bodyType',
      'renderer',
      'encoding',
    ])
  })

  it('throws when a constrained component is missing from the document', async () => {
    const document = await buildDocument()
    delete (document.components!.schemas as Record<string, unknown>).TemplateContent
    expect(() => applyNotifySchemaConstraints(document)).toThrow(/TemplateContent/)
  })
})
