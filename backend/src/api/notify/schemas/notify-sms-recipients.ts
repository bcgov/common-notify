import {
  IsArray,
  IsString,
  IsOptional,
  ArrayMaxSize,
  ArrayMinSize,
  ValidationArguments,
} from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNormalizablePhoneNumber } from './validators/normalizable-phone-number.validator'
import { PhoneNumberService } from '../services/phone-number.service'
import { MAIL_MERGE_MAX_ROWS } from './mail-merge.constants'
import { IsValidMergeArray } from './validators/merge-array.validator'

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
  @ApiPropertyOptional({
    type: [String],
    description:
      'Phone number recipients. Every recipient receives the same body. Mutually exclusive with mergeArray.',
    example: ['+12505550123', '+16045550147'],
  })
  @IsOptional()
  @IsArray()
  // Optional because a merge supplies recipients instead - but an empty list is still a mistake.
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNormalizablePhoneNumber({ each: true, message: e164RecipientMessage })
  to?: string[]

  @ApiPropertyOptional({
    description:
      'Mail-merge rows. The first row is the header and its first column must be "to" (the recipient phone number); each following row is one recipient. Extra columns become that recipient\'s template params, so every recipient can receive a different message. Mutually exclusive with "to".',
    example: [
      ['to', 'firstName', 'appointmentTime'],
      ['+12505550123', 'Alice', '9:00 AM'],
      ['+16045550147', 'Bob', '10:30 AM'],
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAIL_MERGE_MAX_ROWS)
  @IsValidMergeArray()
  mergeArray?: string[][]
}
