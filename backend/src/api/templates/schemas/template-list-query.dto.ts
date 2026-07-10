import { IsOptional, IsString } from 'class-validator'
import { ListQueryDto } from '../../../common/query/list-query.dto'

/**
 * Templates list query DTO.
 *
 * Extends the shared ListQueryDto (pagination, sort, filter) with a templates-only
 * `search` param. Kept separate from ListQueryDto so search stays scoped to the
 * templates controller and does not affect other controllers' query validation.
 * This is to get the frontend search field working again.
 */
export class TemplateListQueryDto extends ListQueryDto {
  /**
   * Case-insensitive search across template title (name) and description.
   */
  @IsOptional()
  @IsString()
  search?: string
}
