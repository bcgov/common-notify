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
 * Each branch lists only its own fields, so closing it with `additionalProperties: false` is what
 * makes the branches mutually exclusive: an addressed payload carries no `mergeArray`, a template
 * payload no inline field. Without that, every branch is an all-optional object, every payload
 * matches more than one, and "exactly one" can never hold. They mirror the validators that
 * actually run: ValidateRecipientsOrMerge, TemplateOrContentConstraint and
 * TemplateOrRendererConstraint, and the global ValidationPipe, which rejects unknown fields.
 *
 * They are applied to the generated document because @ApiSchema accepts only a name and a
 * description. Putting them on the named component rather than on the branch lets each branch be a
 * bare `$ref`, which is the only form Swagger UI labels with the schema's name.
 *
 * `required`/`not` subschemas were the previous spelling. They were correct, but Swagger UI draws
 * only `properties`, so each one rendered as an empty `{ }` the reader could make nothing of.
 */
const SCHEMA_CONSTRAINTS: ReadonlyArray<[Type<unknown>, SchemaObject]> = [
  // At least one of to/cc/bcc, which is all this schema holds.
  [NotifyEmailAddressRecipients, { additionalProperties: false, minProperties: 1 }],
  [NotifyEmailMergeRecipients, { additionalProperties: false, required: ['mergeArray'] }],
  [NotifySmsAddressRecipients, { additionalProperties: false, required: ['to'] }],
  [NotifySmsMergeRecipients, { additionalProperties: false, required: ['mergeArray'] }],
  [NotifyTemplateContent, { additionalProperties: false, required: ['templateId'] }],
  // Neither rule requires a channel to carry content at all - the request-level rule only asks that
  // *some* channel renders something - so the inline branches require nothing.
  [NotifyEmailInlineContent, { additionalProperties: false }],
  [NotifySmsInlineContent, { additionalProperties: false }],
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
