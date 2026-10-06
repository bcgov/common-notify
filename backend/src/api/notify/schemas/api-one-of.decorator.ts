import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { ApiPropertyOptions } from '@nestjs/swagger'

interface OneOfOptions {
  /** Branches, in the order they should appear. */
  oneOf: Record<string, unknown>[]
  description?: string
}

/**
 * Document a property as exactly one of several shapes.
 *
 * `type: 'object'` is load-bearing. Wherever @nestjs/swagger can reflect a class from the property's
 * TypeScript type it injects a `$ref` to it - as an `allOf` beside the branches - which publishes
 * "match the combined class AND one branch" and leaves the combined class in the components list for
 * no reason. Declaring the type explicitly stops the reflection.
 *
 * `ApiPropertyOptions` types `type` and `oneOf` as mutually exclusive, hence the cast. The pair is
 * valid OpenAPI, and it is exactly what the generator emits for a hand-written oneOf.
 */
export const ApiOneOf = ({ oneOf, description }: OneOfOptions) =>
  ApiProperty({
    type: 'object',
    oneOf,
    ...(description && { description }),
  } as unknown as ApiPropertyOptions)

/** {@link ApiOneOf} for an optional property. */
export const ApiOneOfOptional = ({ oneOf, description }: OneOfOptions) =>
  ApiPropertyOptional({
    type: 'object',
    oneOf,
    ...(description && { description }),
  } as unknown as ApiPropertyOptions)
