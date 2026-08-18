import { IsArray, IsString, ArrayMinSize, ValidationArguments } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { IsE164 } from './validators/e164.validator'
import { PhoneNumberService } from '../services/phone-number.service'

const phoneNumberService = new PhoneNumberService()

function e164RecipientMessage(args: ValidationArguments): string {
  const recipients = Array.isArray(args.value) ? args.value : [args.value]
  const invalidRecipients = recipients
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => typeof value !== 'string' || !phoneNumberService.isValid(value))
    .map(({ value, index }) => `${args.property}[${index}] '${String(value)}'`)

  return `${invalidRecipients.join(', ')} is not a valid E.164 phone number`
}

export class NotifySmsRecipients {
  @ApiProperty({ type: [String], description: 'Phone number recipients' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsE164({ each: true, message: e164RecipientMessage })
  to: string[]
}
