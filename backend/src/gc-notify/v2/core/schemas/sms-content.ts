import { ApiProperty } from '@nestjs/swagger';

export class SmsContent {
  @ApiProperty({ description: 'SMS message body' })
  body: string;

  @ApiProperty({
    description:
      'Sender - either alphanumeric sender ID (e.g. GOVBC) or E.164 phone number (e.g. +15551234567)',
    examples: {
      alphanumeric: { value: 'GOVBC' },
      e164: { value: '+15551234567' },
    },
  })
  from_number: string;
}
