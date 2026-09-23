import type { Type } from '@nestjs/common'
import { getSchemaPath } from '@nestjs/swagger'
import type { OpenAPIObject } from '@nestjs/swagger'
import {
  NotifyEmailInlineContent,
  NotifySmsInlineContent,
  NotifyTemplateContent,
} from './notify-content'
import { NotifyEmailAddressRecipients, NotifyEmailMergeRecipients } from './notify-email-recipients'
import { NotifySmsAddressRecipients, NotifySmsMergeRecipients } from './notify-sms-recipients'

// @nestjs/swagger's exports map hides its SchemaObject type, so take it from the public document type.
type SchemaObject = Exclude<
  NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string],
  { $ref: string }
>

/**
 * Schema-level keywords for the named `oneOf` branches on the channel classes.
 *
 * Each branch is an all-optional object on its own, so these keywords are what make the branches
 * mutually exclusive - without them every payload matches more than one branch and "exactly one"
 * can never hold. They mirror the validators that actually run: ValidateRecipientsOrMerge,
 * TemplateOrContentConstraint and TemplateOrRendererConstraint.
 *
 * They are applied to the generated document because @ApiSchema accepts only a name and a
 * description. Putting them on the named component rather than on the branch lets each branch be a
 * bare `$ref`, which is the only form Swagger UI labels with the schema's name.
 */
const EMAIL_ADDRESSED = [{ required: ['to'] }, { required: ['cc'] }, { required: ['bcc'] }]

const SCHEMA_CONSTRAINTS: ReadonlyArray<[Type<unknown>, SchemaObject]> = [
  [NotifyEmailAddressRecipients, { anyOf: EMAIL_ADDRESSED, not: { required: ['mergeArray'] } }],
  [NotifyEmailMergeRecipients, { required: ['mergeArray'], not: { anyOf: EMAIL_ADDRESSED } }],
  [NotifySmsAddressRecipients, { required: ['to'], not: { required: ['mergeArray'] } }],
  [NotifySmsMergeRecipients, { required: ['mergeArray'], not: { required: ['to'] } }],
  [
    NotifyTemplateContent,
    {
      required: ['templateId'],
      not: {
        anyOf: [
          { required: ['subject'] },
          { required: ['body'] },
          { required: ['renderer'] },
          { required: ['bodyType'] },
          { required: ['encoding'] },
        ],
      },
    },
  ],
  [NotifyEmailInlineContent, { not: { required: ['templateId'] } }],
  [NotifySmsInlineContent, { not: { required: ['templateId'] } }],
]

/**
 * Merge SCHEMA_CONSTRAINTS into the generated document's components. Throws if a component is
 * missing, so a renamed @ApiSchema cannot silently drop the constraints.
 */
export function applyNotifySchemaConstraints(document: OpenAPIObject): OpenAPIObject {
  const schemas = (document.components?.schemas ?? {}) as Record<string, SchemaObject>

  for (const [model, { required, ...keywords }] of SCHEMA_CONSTRAINTS) {
    const name = getSchemaPath(model).split('/').pop()!
    const schema = schemas[name]
    if (!schema) {
      throw new Error(`Swagger schema constraints: no component named ${name}`)
    }
    Object.assign(schema, keywords)
    if (required) {
      schema.required = [...new Set([...(schema.required ?? []), ...required])]
    }
  }

  return document
}
