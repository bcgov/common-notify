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
  let paramIndex = 0

  for (const filter of filters) {
    const fieldConfig = config.filterableFields[filter.field]
    const column = fieldConfig.column
    const paramName = `filter_${paramIndex++}`
    const isStringField = (fieldConfig.valueType ?? 'string') === 'string'

    if (filter.operator === 'eq') {
      if (isStringField) {
        qb.andWhere(`LOWER(${column}) = :${paramName}`, {
          [paramName]: String(filter.value).toLowerCase(),
        })
      } else {
        qb.andWhere(`${column} = :${paramName}`, { [paramName]: filter.value })
      }
      continue
    }

    if (filter.operator === 'ne') {
      if (isStringField) {
        qb.andWhere(`LOWER(${column}) != :${paramName}`, {
          [paramName]: String(filter.value).toLowerCase(),
        })
      } else {
        qb.andWhere(`${column} != :${paramName}`, { [paramName]: filter.value })
      }
      continue
    }

    if (filter.operator === 'in') {
      if (isStringField) {
        const loweredValues = (filter.value as Array<string | number | boolean | Date>).map((v) =>
          String(v).toLowerCase(),
        )
        qb.andWhere(`LOWER(${column}) IN (:...${paramName})`, { [paramName]: loweredValues })
      } else {
        qb.andWhere(`${column} IN (:...${paramName})`, { [paramName]: filter.value })
      }
      continue
    }

    if (filter.operator === 'like') {
      const value = escapeLikePattern(String(filter.value))
      qb.andWhere(String.raw`${column} ILIKE :${paramName} ESCAPE '\'`, {
        [paramName]: `%${value}%`,
      })
      continue
    }

    if (filter.operator === 'gte') {
      qb.andWhere(`${column} >= :${paramName}`, { [paramName]: filter.value })
      continue
    }

    if (filter.operator === 'lte') {
      qb.andWhere(`${column} <= :${paramName}`, { [paramName]: filter.value })
      continue
    }

    if (filter.operator === 'isnull') {
      qb.andWhere(`${column} IS NULL`)
    }
  }

  return qb
}
