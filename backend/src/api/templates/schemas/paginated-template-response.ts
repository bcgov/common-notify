import { TemplateResponseDto } from './template-response.dto'
import { PaginatedResponse } from '../../../common/schemas/paginated-response'

export class PaginatedTemplateResponse extends PaginatedResponse(TemplateResponseDto) {}
