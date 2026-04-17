import { ApiProperty } from '@nestjs/swagger';
import { Notification } from './notification';
import { Links } from './links';

export class NotificationsListResponse {
  @ApiProperty({
    description: 'List of notifications',
    type: [Notification],
  })
  notifications: Notification[];

  @ApiProperty({
    description: 'Pagination links',
    type: Links,
  })
  links: Links;
}
