import {
  IsOptional,
  IsUrl,
  IsString,
  IsArray,
  IsBoolean,
  IsObject,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsByteLength,
  MaxLength,
} from 'class-validator'
// PartialType from @nestjs/swagger, not @nestjs/mapped-types: only this one carries the
// @ApiProperty metadata across, without which the update DTO publishes as an empty schema.
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { WebhookType } from '../../../enum/webhook-type.enum'
import { AllowedWebhookHeaders } from '../allowed-webhook-headers.validator'

export const CHANNEL_TYPE_VALUES = ['email', 'sms', 'msgApp'] as const
export const TRIGGER_VALUES = ['success', 'failure'] as const
// webhook_config.url is VARCHAR(2048).
export const CALLBACK_URL_MAX_LENGTH = 2048
// webhook_config.secret is VARCHAR(512) holding base64(28-byte IV and tag + secret), which caps
// the plaintext at 356 UTF-8 bytes. Bytes, not characters, are what overflow the column.
export const CALLBACK_SECRET_MAX_BYTES = 356

export class CallbackRegistrationRequest {
  @ApiProperty({
    description: 'HTTPS endpoint Notify POSTs delivery events to. Plain HTTP is rejected.',
    format: 'uri',
    example: 'https://example.gov.bc.ca/hooks/notify',
    maxLength: CALLBACK_URL_MAX_LENGTH,
  })
  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(CALLBACK_URL_MAX_LENGTH)
  url: string

  @ApiPropertyOptional({
    description:
      'Shared secret. When set, each call carries an HMAC of the body in X-Webhook-Signature so ' +
      'you can verify it came from Notify. The secret itself is never sent - to authenticate ' +
      'Notify to your endpoint, put a token in headers.Authorization instead.',
    example: 's3cr3t-value-you-generate',
    maxLength: CALLBACK_SECRET_MAX_BYTES,
  })
  @IsOptional()
  @IsString()
  @IsByteLength(0, CALLBACK_SECRET_MAX_BYTES, {
    message: `secret must be at most ${CALLBACK_SECRET_MAX_BYTES} bytes`,
  })
  secret?: string

  @ApiPropertyOptional({
    description:
      'Extra headers sent with every call, for example an auth token your endpoint expects. ' +
      'Values must be strings. Host, Cookie, Forwarded, X-Forwarded-*, X-Real-IP, Proxy-*, ' +
      'X-Webhook-Signature and connection/framing headers are rejected.',
    example: { 'X-Environment': 'production' },
  })
  @IsOptional()
  @IsObject()
  @AllowedWebhookHeaders()
  headers?: Record<string, string>

  @ApiProperty({
    description: 'Channel types to filter on.',
    type: [String],
    enum: CHANNEL_TYPE_VALUES,
    example: ['email', 'sms'],
  })
  @IsArray()
  @IsIn(CHANNEL_TYPE_VALUES, { each: true })
  channelType: string[]

  @ApiProperty({
    description: 'Status transitions that trigger delivery.',
    type: [String],
    enum: TRIGGER_VALUES,
    example: ['success', 'failure'],
  })
  @IsArray()
  @IsIn(TRIGGER_VALUES, { each: true })
  trigger: string[]

  @ApiPropertyOptional({
    description: 'Set false to stop deliveries without deleting the registration.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({
    description:
      'Payload shape. "teams" posts a Teams MessageCard; "generic" posts raw JSON. Defaults to ' +
      '"generic".',
    enum: WebhookType,
    example: 'generic',
  })
  @IsOptional()
  @IsEnum(WebhookType)
  webhookType?: WebhookType
}

export class CallbackRegistrationUpdateRequest extends PartialType(CallbackRegistrationRequest) {}

export class CallbackRegistrationResponse {
  @ApiProperty({
    format: 'uuid',
    description: 'Identifier for this registration. Use it to update or delete the webhook.',
    example: 'b7f4c9e1-2a35-4d68-9f10-5c8e3a2b7d64',
  })
  callbackId: string

  @ApiProperty({
    description: 'HTTPS endpoint registered to receive delivery events.',
    format: 'uri',
    example: 'https://example.gov.bc.ca/hooks/notify',
  })
  url: string

  @ApiPropertyOptional({
    description: 'Extra headers sent with every delivery callback.',
    example: { 'X-Environment': 'production' },
  })
  headers?: Record<string, string>

  @ApiProperty({
    description: 'Channel types this registration filters on.',
    type: [String],
    enum: CHANNEL_TYPE_VALUES,
    example: ['email', 'sms'],
  })
  channelType: string[]

  @ApiProperty({
    description: 'Status transitions that trigger delivery callbacks.',
    type: [String],
    enum: TRIGGER_VALUES,
    example: ['success', 'failure'],
  })
  trigger: string[]
}
