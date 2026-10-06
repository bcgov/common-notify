import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ApiKeyIssuedVia } from '../entities/api-key-consumer.entity'

/** Metadata for a key bound to the tenant. Never includes the key value. */
export class ApiKeySummaryDto {
  @ApiProperty({ description: 'Notify identifier for this binding' })
  id: string

  @ApiPropertyOptional({
    description:
      'Gateway consumer id, {environmentAppId}-{applicationAppId}. Shown in the UI as the API key label.',
    example: '23C4F461-A1B2C3D4E5F',
  })
  clientId?: string

  @ApiPropertyOptional({
    description: 'Free-text note the tenant recorded against the key',
    nullable: true,
  })
  notes?: string | null

  @ApiProperty({
    enum: ApiKeyIssuedVia,
    description: 'Whether Notify issued this key or it was bound from a Portal-issued key',
  })
  issuedVia: ApiKeyIssuedVia

  @ApiPropertyOptional({ description: 'When the key was issued by Notify' })
  issuedAt?: Date

  @ApiPropertyOptional({ description: 'When the key was last regenerated' })
  lastRegeneratedAt?: Date

  /**
   * When the current key value came into existence — the regenerate time if the key has
   * ever been rotated, otherwise the issue time. This is the "Created on" the UI shows,
   * which should track the value the tenant is actually holding.
   */
  @ApiPropertyOptional({ description: 'When the current key value was created' })
  currentKeyCreatedAt?: Date

  @ApiPropertyOptional({ description: 'IDIR GUID of the user who issued or bound the key' })
  issuedByIdirGuid?: string

  @ApiProperty({
    description:
      'False until the key has been used at least once — set when the gateway credential id is first observed',
  })
  activated: boolean

  /**
   * Keys bound through the legacy Postman flow have no gateway clientId, so there is no
   * handle to rotate or annotate. They still authenticate; they just cannot be managed
   * from Notify, and the UI has to say so rather than offering dead controls.
   */
  @ApiProperty({ description: 'Whether Notify can regenerate or annotate this key' })
  manageable: boolean

  @ApiProperty({ description: 'When the binding was created' })
  createdAt: Date
}

/**
 * Response for issue and regenerate.
 *
 * `apiKey` is present exactly once, in the response that created or rotated it.
 * Notify does not store the value and cannot show it again.
 */
export class IssuedApiKeyDto extends ApiKeySummaryDto {
  @ApiProperty({
    description: 'The API key value. Shown once — copy it now, it cannot be retrieved again.',
  })
  apiKey: string

  @ApiProperty({ description: 'Gateway flow that produced the credential' })
  flow: string
}
