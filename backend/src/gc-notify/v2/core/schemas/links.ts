import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Links {
  @ApiProperty({
    description: 'The link to the current page',
  })
  current: string;

  @ApiPropertyOptional({
    description: 'The link to the next page',
  })
  next?: string;
}
