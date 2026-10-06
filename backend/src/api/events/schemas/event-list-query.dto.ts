import { IsOptional, IsString } from 'class-validator'
import { ListQueryDto } from '../../../common/query/list-query.dto'

/**
 * Events list query DTO.
 *
 * Extends the shared ListQueryDto (pagination, sort, filter) with an events-only
 * `search` param, matching TemplateListQueryDto.
 */
export class EventListQueryDto extends ListQueryDto {
  /**
   * Case-insensitive search across event name and description.
   */
  @IsOptional()
  @IsString()
  search?: string
}
