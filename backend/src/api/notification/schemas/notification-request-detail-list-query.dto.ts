import { IsOptional, IsString } from 'class-validator'
import { ListQueryDto } from '../../../common/query/list-query.dto'

/**
 * Notification request detail list query DTO.
 *
 * Extends the shared ListQueryDto (pagination, sort, filter) with a detail-only
 * `search` param. Kept separate from ListQueryDto so search stays scoped to the
 * request-detail endpoint and does not affect other controllers' query validation.
 */
export class NotificationRequestDetailListQueryDto extends ListQueryDto {
  /**
   * Case-insensitive search across recipient address and failure reason.
   */
  @IsOptional()
  @IsString()
  search?: string
}
