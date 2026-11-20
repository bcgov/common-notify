import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import { PaginatedResponse } from '../../../common/schemas/paginated-response'
import type { QueryableFieldsConfig } from '../../../common/query/list-query.types'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

/** Approves a request. What `options` holds depends on the request's type. */
export class ApproveTenantRequestDto {
  @ApiPropertyOptional({
    type: Object,
    description:
      "The admin's choices for this type of request, e.g. { smsNumberId } for an SMS number",
  })
  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>
}

/** Rejects a request. The reason is shown to the tenant. */
export class RejectTenantRequestDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'A reason is required to reject a request' })
  @MaxLength(500)
  reason: string
}

export class TenantRequestDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ format: 'uuid' })
  tenantId: string

  @ApiProperty()
  tenantName: string

  @ApiProperty({ example: 'sms_number' })
  requestTypeCode: string

  @ApiProperty({ example: 'pending' })
  statusCode: string

  @ApiProperty({ nullable: true, type: String })
  requestedBy: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt: string

  @ApiProperty({ nullable: true, type: String })
  decidedBy: string | null

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  decidedAt: string | null

  @ApiProperty({ nullable: true, type: String })
  decisionReason: string | null

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'What approval granted, e.g. the number assigned. Null until approved.',
  })
  outcome: string | null

  @ApiProperty({ nullable: true, type: String, description: 'Who took back what was granted' })
  releasedBy: string | null

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  releasedAt: string | null

  @ApiProperty({ nullable: true, type: String, description: 'Who cancelled the request' })
  cancelledBy: string | null

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  cancelledAt: string | null
}

export class TenantRequestCodeDto {
  @ApiProperty()
  code: string

  @ApiProperty()
  description: string
}

export class TenantRequestCodesDto {
  @ApiProperty({ type: [TenantRequestCodeDto] })
  types: TenantRequestCodeDto[]

  @ApiProperty({ type: [TenantRequestCodeDto] })
  statuses: TenantRequestCodeDto[]
}

/** One page of requests for the admin table. */
export class PaginatedTenantRequestsDto extends PaginatedResponse(TenantRequestDto) {}

/**
 * The admin table filters on status and type (`statusCode:in:pending|approved`,
 * `requestTypeCode:in:sms_number`); search is tenant name.
 */
export const tenantRequestListQueryConfig: QueryableFieldsConfig = {
  sortableFields: {},
  filterableFields: {
    statusCode: { column: 'r.status_code', operators: ['eq', 'in'] },
    requestTypeCode: { column: 'r.request_type_code', operators: ['eq', 'in'] },
  },
}
