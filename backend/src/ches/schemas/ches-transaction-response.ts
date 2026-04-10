import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChesMessageAssociation {
  @ApiProperty({ format: 'uuid' }) msgId: string;
  @ApiProperty({ type: [String] }) to: string[];
  @ApiPropertyOptional() tag?: string;
}

export class ChesTransactionResponse {
  @ApiProperty({ format: 'uuid' }) txId: string;
  @ApiProperty({ type: [ChesMessageAssociation] })
  messages: ChesMessageAssociation[];
}
