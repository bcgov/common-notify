/** The query a paginated list endpoint reads. */
export interface ListQuery {
  page?: number
  limit?: number
  search?: string
  /** `field`, or `-field` for descending. */
  sort?: string
  /** `field:operator:value` tokens; see redux/utils/listFilters. */
  filter?: string[]
}

/** A list query as a URL query string. Empty values are left out, so the server's defaults apply. */
export function toListQueryString({ page, limit, search, sort, filter }: ListQuery): string {
  const qs = new URLSearchParams()
  if (page) qs.set('page', String(page))
  if (limit) qs.set('limit', String(limit))
  if (search) qs.set('search', search)
  if (sort) qs.set('sort', sort)
  filter?.forEach((token) => qs.append('filter', token))
  return qs.toString()
}
