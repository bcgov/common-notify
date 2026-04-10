import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChesSmtpObject {
  @ApiPropertyOptional() smtpMsgId?: string;
  @ApiPropertyOptional() response?: string;
}

export class ChesStatusHistoryItem {
  @ApiProperty() description: string;
  @ApiProperty({
    enum: ['accepted', 'cancelled', 'completed', 'failed', 'pending'],
  })
  status: string;
  @ApiProperty() timestamp: number;
}

export class ChesStatusObject {
  @ApiProperty() createdTS: number;
  @ApiProperty() delayTS: number;
  @ApiProperty({ format: 'uuid' }) msgId: string;
  @ApiPropertyOptional() smtpResponse?: ChesSmtpObject;
  @ApiProperty({
    enum: ['accepted', 'cancelled', 'completed', 'failed', 'pending'],
  })
  status: string;
  @ApiProperty({ type: [ChesStatusHistoryItem] })
  statusHistory: ChesStatusHistoryItem[];
  @ApiProperty() tag: string;
  @ApiProperty({ format: 'uuid' }) txId: string;
  @ApiProperty() updatedTS: number;
}
