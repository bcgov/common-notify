import { IsOptional, IsUrl, IsString, IsArray, IsBoolean, IsObject } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class CallbackRegistrationRequest {
  @ApiPropertyOptional({
    description: 'HTTPS URL to receive webhook POST requests',
    format: 'uri',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url?: string

  @ApiPropertyOptional({ description: 'Optional HMAC secret for X-Webhook-Signature signing' })
  @IsOptional()
  @IsString()
  secret?: string

  @ApiPropertyOptional({ description: 'Custom headers to include in webhook POST requests' })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>

  @ApiPropertyOptional({
    description: 'Channel types to filter on. Empty or omitted means all channels.',
    type: [String],
    enum: ['email', 'sms', 'msgApp'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channelType?: string[]

  @ApiPropertyOptional({
    description: 'Status triggers. "success" fires on COMPLETED, "failure" on FAILED.',
    type: [String],
    enum: ['success', 'failure'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trigger?: string[]

  @ApiPropertyOptional({ description: 'Enable or disable this webhook configuration' })
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

export class CallbackRegistrationResponse {
  callbackId: string
  url: string
  secret?: string
  headers?: Record<string, string>
  channelType: string[]
  trigger: string[]
  active: boolean
  createdAt: Date
  updatedAt: Date
}
