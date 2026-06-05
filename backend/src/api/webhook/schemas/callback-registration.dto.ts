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
import { PartialType } from '@nestjs/mapped-types'
import { WebhookType } from '../../../enum/webhook-type.enum'

export const CHANNEL_TYPE_VALUES = ['email', 'sms', 'msgApp'] as const
export const TRIGGER_VALUES = ['success', 'failure'] as const

export class CallbackRegistrationRequest {
  @ApiProperty({
    description: 'HTTPS URL to receive webhook POST requests',
    format: 'uri',
  })
  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url: string

  @ApiPropertyOptional({ description: 'Optional HMAC secret for X-Webhook-Signature signing' })
  @IsOptional()
  @IsString()
  secret?: string

  @ApiPropertyOptional({ description: 'Custom headers to include in webhook POST requests' })
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

  @ApiPropertyOptional({ description: 'Enable or disable this webhook configuration' })
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({
    description:
      'Webhook type. "teams" sends a Teams MessageCard payload; "generic" sends raw JSON. Defaults to "generic".',
    enum: WebhookType,
  })
  @IsOptional()
  @IsEnum(WebhookType)
  webhookType?: WebhookType
}

export class CallbackRegistrationUpdateRequest extends PartialType(CallbackRegistrationRequest) {}

export class CallbackRegistrationResponse {
  callbackId: string
  url: string
  headers?: Record<string, string>
  channelType: string[]
  trigger: string[]
}
