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

  it('makes a stored template exclude every inline and rendering field', () => {
    expect(schemas.TemplateContent.required).toEqual(['templateId'])
    expect(schemas.TemplateContent.not.anyOf.map((c: any) => c.required[0])).toEqual([
      'subject',
      'body',
      'renderer',
      'bodyType',
      'encoding',
    ])
  })

  it.each(['EmailInlineContent', 'SmsInlineContent'])('makes %s exclude a templateId', (name) => {
    expect(schemas[name].not).toEqual({ required: ['templateId'] })
    expect(schemas[name].required).toBeUndefined()
  })

  it('publishes only the fields SMS inline rendering reads', () => {
    expect(Object.keys(schemas.SmsInlineContent.properties)).toEqual(['body', 'renderer'])
  })

  it('makes addressed and mail-merge recipients mutually exclusive', () => {
    expect(schemas.EmailRecipients.not).toEqual({ required: ['mergeArray'] })
    expect(schemas.EmailMailMerge.required).toEqual(['mergeArray'])
    expect(schemas.SmsRecipients.required).toEqual(['to'])
    expect(schemas.SmsMailMerge.not).toEqual({ required: ['to'] })
  })

  it('throws when a constrained component is missing from the document', async () => {
    const document = await buildDocument()
    delete (document.components!.schemas as Record<string, unknown>).TemplateContent
    expect(() => applyNotifySchemaConstraints(document)).toThrow(/TemplateContent/)
  })
})
