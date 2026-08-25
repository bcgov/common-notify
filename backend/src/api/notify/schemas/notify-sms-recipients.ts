import { IsArray, IsString, ArrayMinSize, ValidationArguments } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { IsNormalizablePhoneNumber } from './validators/normalizable-phone-number.validator'
import { PhoneNumberService } from '../services/phone-number.service'

const phoneNumberService = new PhoneNumberService()

function e164RecipientMessage(args: ValidationArguments): string {
  const recipients = Array.isArray(args.value) ? args.value : [args.value]
  const invalidRecipients = recipients
    .map((value, index) => ({ value, index }))
    .filter(
      ({ value }) => typeof value !== 'string' || phoneNumberService.normalize(value) === null,
    )
    .map(({ value, index }) => `${args.property}[${index}] '${String(value)}'`)

  return `${invalidRecipients.join(', ')} is not a valid phone number`
}

export class NotifySmsRecipients {
  @ApiProperty({ type: [String], description: 'Phone number recipients' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNormalizablePhoneNumber({ each: true, message: e164RecipientMessage })
  to: string[]
}
