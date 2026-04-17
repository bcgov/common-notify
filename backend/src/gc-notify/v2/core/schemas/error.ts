import { ApiProperty } from '@nestjs/swagger';

export class Error {
  @ApiProperty({
    description: 'Response result',
    example: 'error',
  })
  result: string;

  @ApiProperty({
    description: 'Description of the error',
  })
  message: string;
}
