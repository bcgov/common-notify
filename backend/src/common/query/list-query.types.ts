export type SortDirection = 'ASC' | 'DESC'

export type FilterOperator = 'eq' | 'ne' | 'in' | 'like' | 'gte' | 'lte' | 'isnull'

export type FilterValueType = 'string' | 'number' | 'date' | 'boolean'

export interface ListQuerySort {
  field: string
  direction: SortDirection
}

export interface ListQueryFilter {
  field: string
  operator: FilterOperator
  value: string | number | boolean | Date | Array<string | number | boolean | Date> | null
}

export interface ParsedListQuery {
  page: number
  limit: number
  skip: number
  sorts: ListQuerySort[]
  filters: ListQueryFilter[]
}

export interface FilterFieldConfig {
  column: string
  valueType?: FilterValueType
  operators: FilterOperator[]
}

export interface QueryableFieldsConfig {
  sortableFields: Record<string, string>
  filterableFields: Record<string, FilterFieldConfig>
  defaultSort?: ListQuerySort[]
}
