import { FeatureFlagHistory } from '../entities/feature-flag-history.entity'
import { PaginatedResponse } from '../../../common/schemas/paginated-response'

export class PaginatedFeatureFlagHistoryResponse extends PaginatedResponse(FeatureFlagHistory) {}
