import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { FilterOption } from './DataTable'
import { ColumnHeaderDropdown } from './ColumnHeaderDropdown'

export interface TableHeaderCellProps extends ComponentPropsWithoutRef<'th'> {
  sortable?: boolean
  sortLabel?: string
  sortType?: 'text' | 'numeric' | 'date'
  sortOrder?: 'asc' | 'desc' | null
  onSort?: (order: 'asc' | 'desc' | null) => void
  filterOptions?: FilterOption[]
  filterTitle?: string
  activeFilterValues?: string[]
  onFilter?: (values: string[]) => void
  children?: ReactNode
}

export function TableHeaderCell({
  sortable,
  sortLabel,
  sortType,
  sortOrder,
  onSort,
  filterOptions,
  filterTitle,
  activeFilterValues,
  onFilter,
  children,
  ...props
}: TableHeaderCellProps) {
  const ariaSort = sortable
    ? sortOrder === 'asc'
      ? 'ascending'
      : sortOrder === 'desc'
        ? 'descending'
        : 'none'
    : undefined

  const hasDropdown = sortable || (filterOptions && filterOptions.length > 0)
  const isFiltered = activeFilterValues && activeFilterValues.length > 0

  return (
    <th scope="col" aria-sort={ariaSort} {...props}>
      {hasDropdown ? (
        <div className="data-table__header-cell">
          <span className="data-table__header-label">{children}</span>
          <ColumnHeaderDropdown
            sortable={sortable}
            sortType={sortType}
            sortOrder={sortOrder ?? null}
            onSort={onSort}
            filterOptions={filterOptions}
            filterTitle={filterTitle}
            activeFilterValues={activeFilterValues ?? []}
            onFilter={onFilter}
          >
            <button
              type="button"
              className="data-table__dropdown-btn"
              aria-label={
                sortLabel ??
                (typeof children === 'string' ? `Column options for ${children}` : 'Column options')
              }
            >
              {isFiltered ? (
                <span className="data-table__filter-badge">{activeFilterValues!.length}</span>
              ) : (
                <KeyboardArrowDownIcon className="data-table__dropdown-icon" aria-hidden="true" />
              )}
            </button>
          </ColumnHeaderDropdown>
        </div>
      ) : (
        children
      )}
    </th>
  )
}
