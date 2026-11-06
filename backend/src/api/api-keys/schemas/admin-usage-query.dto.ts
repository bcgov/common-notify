import { IsOptional, IsString } from 'class-validator'
import { ListQueryDto } from '../../../common/query/list-query.dto'

/**
 * Admin all-tenants usage query: the shared ListQueryDto (pagination, filter) plus a tenant name
 * `search`, the same shape as TemplateListQueryDto. Filterable fields are listed in
 * adminUsageListQueryConfig.
 */
export class AdminUsageQueryDto extends ListQueryDto {
  /** Case-insensitive substring of the tenant name. */
  @IsOptional()
  @IsString()
  search?: string
}
