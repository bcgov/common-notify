import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class FileAttachment {
  @ApiProperty({
    description: 'File content as base64 encoded string',
  })
  @IsString()
  file: string;

  @ApiProperty({
    description: 'Custom filename for the attachment',
  })
  @IsString()
  filename: string;

  @ApiProperty({
    description: 'How the file should be sent - as attachment or as a link',
    enum: ['attach', 'link'],
  })
  @IsIn(['attach', 'link'])
  sending_method: 'attach' | 'link';
}
