import { BadRequestException } from '@nestjs/common'
import { ListQueryDto } from './list-query.dto'
import type {
  FilterOperator,
  FilterValueType,
  ListQueryFilter,
  ListQuerySort,
  ParsedListQuery,
  QueryableFieldsConfig,
} from './list-query.types'

function parseValueByType(rawValue: string, valueType: FilterValueType) {
  if (valueType === 'number') {
    const parsed = Number(rawValue)
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`Invalid number value: '${rawValue}'`)
    }
    return parsed
  }

  if (valueType === 'date') {
    const parsed = new Date(rawValue)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date value: '${rawValue}'`)
    }
    return parsed
  }

  if (valueType === 'boolean') {
    const lowered = rawValue.toLowerCase()
    if (lowered === 'true') {
      return true
    }
    if (lowered === 'false') {
      return false
    }
    throw new BadRequestException(`Invalid boolean value: '${rawValue}'`)
  }

  return rawValue
}

function parseFilterToken(token: string, config: QueryableFieldsConfig): ListQueryFilter {
  const [field, operatorToken, ...valueParts] = token.split(':')

  if (!field || !operatorToken) {
    throw new BadRequestException(
      `Invalid filter '${token}'. Expected format: field:operator:value`,
    )
  }

  const fieldConfig = config.filterableFields[field]
  if (!fieldConfig) {
    throw new BadRequestException(`Unsupported filter field '${field}'`)
  }

  const operator = operatorToken as FilterOperator
  if (!fieldConfig.operators.includes(operator)) {
    throw new BadRequestException(`Unsupported operator '${operator}' for field '${field}'`)
  }

  if (operator === 'isnull') {
    return {
      field,
      operator,
      value: null,
    }
  }

  const rawValue = valueParts.join(':')
  if (!rawValue) {
    throw new BadRequestException(`Filter '${token}' is missing a value`)
  }

  const valueType = fieldConfig.valueType ?? 'string'
  if (operator === 'in') {
    const values = rawValue
      .split('|')
      .filter(Boolean)
      .map((item) => parseValueByType(item, valueType))

    if (values.length === 0) {
      throw new BadRequestException(`Filter '${token}' must include at least one value for 'in'`)
    }

    return {
      field,
      operator,
      value: values,
    }
  }

  return {
    field,
    operator,
    value: parseValueByType(rawValue, valueType),
  }
}

function parseSort(sort: string | undefined, config: QueryableFieldsConfig): ListQuerySort[] {
  if (!sort) {
    return config.defaultSort ?? []
  }

  const sortTokens = sort.split(',').map((token) => token.trim())
  const parsed: ListQuerySort[] = []

  for (const token of sortTokens) {
    if (!token) {
      continue
    }

    const direction = token.startsWith('-') ? 'DESC' : 'ASC'
    const field = token.startsWith('-') ? token.slice(1) : token

    if (!config.sortableFields[field]) {
      throw new BadRequestException(`Unsupported sort field '${field}'`)
    }

    parsed.push({ field, direction })
  }

  return parsed.length > 0 ? parsed : (config.defaultSort ?? [])
}

export function parseListQuery(
  query: ListQueryDto,
  config: QueryableFieldsConfig,
): ParsedListQuery {
  const { page, limit } = query
  const filters: ListQueryFilter[] = (query.filter ?? []).map((token) =>
    parseFilterToken(token, config),
  )
  const sorts = parseSort(query.sort, config)

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    filters,
    sorts,
  }
}
