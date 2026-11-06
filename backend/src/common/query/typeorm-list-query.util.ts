import type { SelectQueryBuilder } from 'typeorm'
import type { ListQueryFilter, ParsedListQuery, QueryableFieldsConfig } from './list-query.types'

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, String.raw`\$&`)
}

export function applyParsedListQueryToQueryBuilder<T>(
  qb: SelectQueryBuilder<T>,
  parsedQuery: ParsedListQuery,
  config: QueryableFieldsConfig,
) {
  applyListQueryFilters(qb, parsedQuery.filters, config)

  for (const sort of parsedQuery.sorts) {
    qb.addOrderBy(config.sortableFields[sort.field], sort.direction)
  }

  qb.skip(parsedQuery.skip)
  qb.take(parsedQuery.limit)

  return qb
}

/**
 * The filters alone, without sorting or paging, for a query that pages differently from the
 * rows it filters: a count, or a page of parents whose children are loaded separately.
 */
export function applyListQueryFilters<T>(
  qb: SelectQueryBuilder<T>,
  filters: ListQueryFilter[],
  config: QueryableFieldsConfig,
) {
  filters.forEach((filter, index) => {
    const fieldConfig = config.filterableFields[filter.field]
    const condition = filterCondition(filter, {
      column: fieldConfig.column,
      param: `filter_${index}`,
      isString: (fieldConfig.valueType ?? 'string') === 'string',
    })
    if (condition.params) qb.andWhere(condition.where, condition.params)
    else qb.andWhere(condition.where)
  })

  return qb
}

interface FilterTarget {
  column: string
  param: string
  /** Strings compare case-insensitively. */
  isString: boolean
}

interface FilterCondition {
  where: string
  params?: Record<string, unknown>
}

/** One value, as the parser produces for every operator but `in` and `isnull`. */
type FilterScalar = string | number | boolean | Date

function filterCondition(filter: ListQueryFilter, target: FilterTarget): FilterCondition {
  const { column, param } = target
  switch (filter.operator) {
    case 'eq':
      return comparison('=', filter.value as FilterScalar, target)
    case 'ne':
      return comparison('!=', filter.value as FilterScalar, target)
    case 'in':
      return inList(filter.value as FilterScalar[], target)
    case 'like':
      return {
        where: String.raw`${column} ILIKE :${param} ESCAPE '\'`,
        params: { [param]: `%${escapeLikePattern(String(filter.value as FilterScalar))}%` },
      }
    case 'gte':
      return { where: `${column} >= :${param}`, params: { [param]: filter.value } }
    case 'lte':
      return { where: `${column} <= :${param}`, params: { [param]: filter.value } }
    case 'isnull':
      return { where: `${column} IS NULL` }
  }
}

function comparison(
  operator: '=' | '!=',
  value: FilterScalar,
  { column, param, isString }: FilterTarget,
): FilterCondition {
  return isString
    ? { where: `LOWER(${column}) ${operator} :${param}`, params: { [param]: lower(value) } }
    : { where: `${column} ${operator} :${param}`, params: { [param]: value } }
}

function inList(
  values: FilterScalar[],
  { column, param, isString }: FilterTarget,
): FilterCondition {
  return isString
    ? { where: `LOWER(${column}) IN (:...${param})`, params: { [param]: values.map(lower) } }
    : { where: `${column} IN (:...${param})`, params: { [param]: values } }
}

function lower(value: FilterScalar): string {
  return String(value).toLowerCase()
}
