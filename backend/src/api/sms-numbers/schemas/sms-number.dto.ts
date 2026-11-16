import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator'
import {
  SMS_NUMBER_PATTERN,
  SMS_NUMBER_TYPE_CODES,
  SMS_PROVIDER_CODES,
  SmsNumberRequestStatus,
} from '../sms-number-codes'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
/** An optional text field: blank is stored as null. */
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value

/** A number added to the inventory. Admin-only. */
export class CreateSmsNumberDto {
  @ApiProperty({ description: 'E.164, or a 5-6 digit short code', example: '+15551234567' })
  @Transform(trim)
  @IsString()
  @Matches(SMS_NUMBER_PATTERN, {
    message: 'phoneNumber must be E.164 (e.g. +15551234567) or a 5-6 digit short code',
  })
  phoneNumber: string

  @ApiProperty({ enum: SMS_PROVIDER_CODES, description: 'The provider hosting the number' })
  @IsIn(SMS_PROVIDER_CODES)
  providerCode: string

  @ApiProperty({ enum: SMS_NUMBER_TYPE_CODES })
  @IsIn(SMS_NUMBER_TYPE_CODES)
  numberTypeCode: string

  @ApiPropertyOptional({
    description: "The provider's own id for the number",
    maxLength: 200,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(200)
  providerReference?: string | null

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  description?: string | null
}

/**
 * The editable details of a number. The number and its provider are fixed: changing either would
 * silently move every tenant assigned to it, so a different number is added and assigned instead.
 */
export class UpdateSmsNumberDto extends PartialType(
  PickType(CreateSmsNumberDto, ['numberTypeCode', 'providerReference', 'description'] as const),
) {}

/** Assigns a number to a tenant, replacing its number for that number's provider. */
export class AssignSmsNumberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  smsNumberId: string
}

/**
 * Approves a request by assigning the tenant a number from the inventory, or, outside prod, by
 * leaving it on the default number. Exactly one of the two.
 */
export class ApproveSmsNumberRequestDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The inventory number to assign' })
  @ValidateIf((dto: ApproveSmsNumberRequestDto) => !dto.useDefaultNumber)
  @IsUUID('all', { message: 'Choose a number to assign, or the default number' })
  smsNumberId?: string

  @ApiPropertyOptional({
    description: 'Approve on the service-wide default number. Not allowed in prod.',
  })
  @IsOptional()
  @IsBoolean()
  useDefaultNumber?: boolean
}

/** Rejects a request. The reason is shown to the tenant. */
export class RejectSmsNumberRequestDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'A reason is required to reject a request' })
  @MaxLength(500)
  reason: string
}

export class SmsNumberTenantDto {
  @ApiProperty({ format: 'uuid' })
  tenantId: string

  @ApiProperty()
  tenantName: string
}

export class SmsNumberDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty()
  phoneNumber: string

  @ApiProperty()
  providerCode: string

  @ApiProperty()
  numberTypeCode: string

  @ApiProperty({ nullable: true, type: String })
  providerReference: string | null

  @ApiProperty({ nullable: true, type: String })
  description: string | null

  @ApiProperty({
    description:
      "What a tenant without a number of its own sends from, through this number's provider",
  })
  isDefault: boolean

  @ApiProperty({ type: [SmsNumberTenantDto], description: 'Tenants assigned the number' })
  tenants: SmsNumberTenantDto[]
}

export class SmsNumberRequestDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ format: 'uuid' })
  tenantId: string

  @ApiProperty()
  tenantName: string

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

  @ApiProperty({ nullable: true, type: String, description: 'The number assigned on approval' })
  phoneNumber: string | null

  @ApiProperty({
    description: 'Approved on the service-wide default number rather than one of its own',
  })
  usesDefaultNumber: boolean

  @ApiProperty({ nullable: true, type: String, description: 'Who released the number' })
  releasedBy: string | null

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  releasedAt: string | null

  @ApiProperty({ nullable: true, type: String, description: 'Who cancelled the request' })
  cancelledBy: string | null

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  cancelledAt: string | null
}

export class SmsCodeDto {
  @ApiProperty()
  code: string

  @ApiProperty()
  description: string
}

export class SmsNumberCodesDto {
  @ApiProperty({ type: [SmsCodeDto] })
  providers: SmsCodeDto[]

  @ApiProperty({ type: [SmsCodeDto] })
  numberTypes: SmsCodeDto[]

  @ApiProperty({ type: [SmsCodeDto] })
  requestStatuses: SmsCodeDto[]

  @ApiProperty({ description: 'The provider SMS is sending through now', example: 'aws' })
  activeProvider: string

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "The active provider's default number, else the DEFAULT_SMS_FROM_NUMBER environment variable",
  })
  defaultNumber: string | null

  @ApiProperty({
    description: 'Whether a request can be approved on the default number (not prod)',
  })
  defaultNumberAssignable: boolean
}

export class ListSmsNumberRequestsQueryDto {
  @ApiPropertyOptional({ enum: Object.values(SmsNumberRequestStatus) })
  @IsOptional()
  @IsIn(Object.values(SmsNumberRequestStatus))
  status?: SmsNumberRequestStatus
}

/**
 * The tenant's latest request, wrapped so "none yet" is an explicit null rather than no body, and
 * what the tenant sends from meanwhile.
 */
export class TenantSmsNumberRequestResponseDto {
  @ApiProperty({ type: SmsNumberRequestDto, nullable: true })
  request: SmsNumberRequestDto | null

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "The number the tenant's SMS goes out from now: its own, else the active provider's default",
  })
  senderNumber: string | null

  @ApiProperty({
    description:
      'Dev, test or a PR environment, where every tenant normally sends from the shared default number',
  })
  testEnvironment: boolean
}
