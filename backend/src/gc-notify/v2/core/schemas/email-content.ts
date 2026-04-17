import { ApiProperty } from '@nestjs/swagger';

export class EmailContent {
  @ApiProperty({
    description: 'From email address',
    example: 'noreply@gov.bc.ca',
    format: 'email',
  })
  from_email: string;

  @ApiProperty({ description: 'Email body content' })
  body: string;

  @ApiProperty({ description: 'Email subject line' })
  subject: string;
}
