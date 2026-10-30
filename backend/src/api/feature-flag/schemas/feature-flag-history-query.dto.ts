import { PickType } from '@nestjs/swagger'
import { ListQueryDto } from '../../../common/query/list-query.dto'

/** page and limit only, with ListQueryDto's defaults (1, 10) and cap (100). */
export class FeatureFlagHistoryQueryDto extends PickType(ListQueryDto, [
  'page',
  'limit',
] as const) {}
