import { IsOptional, IsString } from 'class-validator'
import { ListQueryDto } from './list-query.dto'

/** The shared list query plus a free-text `search`; each endpoint says what it searches. */
export class SearchableListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  search?: string
}
