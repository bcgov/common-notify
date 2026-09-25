import { ApiProperty } from '@nestjs/swagger'

export class EmailContent {
  @ApiProperty({
    description: 'From email address',
    example: 'noreply@gov.bc.ca',
    format: 'email',
  })
  from_email: string

  @ApiProperty({
    description: 'The rendered email body.',
    example: 'Hello Alice, permit BC-2026-00417 has been approved.',
  })
  body: string

  @ApiProperty({
    description: 'The rendered subject line.',
    example: 'Permit BC-2026-00417 approved',
  })
  subject: string
}
