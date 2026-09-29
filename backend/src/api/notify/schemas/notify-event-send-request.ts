import { ArrayMaxSize, IsArray, IsEmail, IsObject, IsOptional, IsUUID } from 'class-validator'
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'

export const TEST_SEND_MAX_RECIPIENTS = 5

@ApiSchema({
  description:
    'Send an event’s notification. The template, sender, header and recipients all come from ' +
    'the event’s channel settings; only the values substituted into the template are supplied here.',
})
export class NotifyEventSendRequest {
  @ApiProperty({ description: 'Event to send the notification for', format: 'uuid' })
  @IsUUID()
  eventId: string

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: "Values substituted into the template's placeholders.",
    example: { firstName: 'Alice', eventName: 'Permit approved' },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>
}

@ApiSchema({
  description:
    'Send a test of an event’s notification. Identical to a real send except that the ' +
    'recipients are supplied rather than taken from the event, and are checked against who the ' +
    'caller is allowed to send a test to.',
})
export class NotifyEventTestSendRequest extends NotifyEventSendRequest {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Addresses to send the test to. Defaults to the caller’s own address. Every address ' +
      'is checked - this route cannot be used to send to arbitrary recipients.',
    example: ['someone@gov.bc.ca'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TEST_SEND_MAX_RECIPIENTS)
  @IsEmail({}, { each: true })
  to?: string[]
}
