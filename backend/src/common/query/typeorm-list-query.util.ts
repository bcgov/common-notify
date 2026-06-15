import type { SelectQueryBuilder } from 'typeorm'
import type { ParsedListQuery, QueryableFieldsConfig } from './list-query.types'

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function applyParsedListQueryToQueryBuilder<T>(
  qb: SelectQueryBuilder<T>,
  parsedQuery: ParsedListQuery,
  config: QueryableFieldsConfig,
) {
  let paramIndex = 0

  for (const filter of parsedQuery.filters) {
    const fieldConfig = config.filterableFields[filter.field]
    const column = fieldConfig.column
    const paramName = `filter_${paramIndex++}`

    if (filter.operator === 'eq') {
      qb.andWhere(`${column} = :${paramName}`, { [paramName]: filter.value })
      continue
    }

    if (filter.operator === 'ne') {
      qb.andWhere(`${column} != :${paramName}`, { [paramName]: filter.value })
      continue
    }

    if (filter.operator === 'in') {
      qb.andWhere(`${column} IN (:...${paramName})`, { [paramName]: filter.value })
      continue
    }

    if (filter.operator === 'like') {
      const value = escapeLikePattern(String(filter.value))
      qb.andWhere(`${column} ILIKE :${paramName} ESCAPE '\\\\'`, { [paramName]: `%${value}%` })
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

  for (const sort of parsedQuery.sorts) {
    qb.addOrderBy(config.sortableFields[sort.field], sort.direction)
  }

  qb.skip(parsedQuery.skip)
  qb.take(parsedQuery.limit)

  return qb
}
