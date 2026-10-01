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
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
// PartialType from @nestjs/swagger, not @nestjs/mapped-types: only this one carries the
// @ApiProperty metadata across, without which the update DTO publishes as an empty schema.
import { PartialType } from '@nestjs/swagger'
import { WebhookType } from '../../../enum/webhook-type.enum'

export const CHANNEL_TYPE_VALUES = ['email', 'sms', 'msgApp'] as const
export const TRIGGER_VALUES = ['success', 'failure'] as const

export class CallbackRegistrationRequest {
  @ApiProperty({
    description: 'HTTPS endpoint Notify POSTs delivery events to. Plain HTTP is rejected.',
    format: 'uri',
    example: 'https://example.gov.bc.ca/hooks/notify',
  })
  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url: string

  @ApiPropertyOptional({
    description:
      'Shared secret. When set, each call carries an HMAC of the body in X-Webhook-Signature so ' +
      'you can verify it came from Notify.',
    example: 's3cr3t-value-you-generate',
  })
  @IsOptional()
  @IsString()
  secret?: string

  @ApiPropertyOptional({
    description:
      'Extra headers sent with every call, for example an auth token your endpoint expects.',
    example: { 'X-Environment': 'production' },
  })
  @IsOptional()
  @IsObject()
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
