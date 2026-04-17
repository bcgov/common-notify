import { ApiProperty } from '@nestjs/swagger';
import { Template } from './template';

export class TemplatesListResponse {
  @ApiProperty({
    description: 'List of templates',
    type: [Template],
  })
  templates: Template[];
}
