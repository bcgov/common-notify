import { ApiProperty } from '@nestjs/swagger';

export class ValidationErrorItem {
  @ApiProperty({ description: 'Error type', example: 'ValidationError' })
  error: string;

  @ApiProperty({ description: 'Error message' })
  message: string;
}

export class ValidationErrorResponse {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  status_code: number;

  @ApiProperty({
    description: 'List of errors',
    type: [ValidationErrorItem],
  })
  errors: ValidationErrorItem[];
}
