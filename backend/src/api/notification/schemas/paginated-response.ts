import { NotificationRequestDto } from './notification-request'
import { PaginatedResponse } from '../../../common/schemas/paginated-response'

export class PaginatedNotificationResponse extends PaginatedResponse(NotificationRequestDto) {}
