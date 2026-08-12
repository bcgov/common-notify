import { NotificationRequestDetailDto } from './notification-request-detail'
import { PaginatedResponse } from '../../../common/schemas/paginated-response'

export class PaginatedNotificationRequestDetailResponse extends PaginatedResponse(
  NotificationRequestDetailDto,
) {}
