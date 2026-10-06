import { EventResponseDto } from './event-response.dto'
import { PaginatedResponse } from '../../../common/schemas/paginated-response'

export class PaginatedEventResponse extends PaginatedResponse(EventResponseDto) {}
