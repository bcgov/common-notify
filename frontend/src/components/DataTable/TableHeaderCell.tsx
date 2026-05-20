import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

export interface TableHeaderCellProps extends ComponentPropsWithoutRef<'th'> {
  sortable?: boolean
  sortOrder?: 'asc' | 'desc' | null
  onSort?: () => void
  children?: ReactNode
}

function SortIcon({ sortOrder }: { sortOrder?: 'asc' | 'desc' | null }) {
  if (sortOrder === 'asc')
    return (
      <KeyboardArrowUpIcon
        className="data-table__sort-icon data-table__sort-icon--active"
        aria-hidden="true"
      />
    )
  if (sortOrder === 'desc')
    return (
      <KeyboardArrowDownIcon
        className="data-table__sort-icon data-table__sort-icon--active"
        aria-hidden="true"
      />
    )
  return <UnfoldMoreIcon className="data-table__sort-icon" aria-hidden="true" />
}

export function TableHeaderCell({
  sortable,
  sortOrder,
  onSort,
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

  return (
    <th scope="col" aria-sort={ariaSort} {...props}>
      {sortable ? (
        <button
          type="button"
          className="data-table__sort-btn"
          aria-label={
            typeof children === 'string'
              ? sortOrder === 'asc'
                ? `Sort by ${children}, currently ascending`
                : sortOrder === 'desc'
                  ? `Sort by ${children}, currently descending`
                  : `Sort by ${children}`
              : undefined
          }
          onClick={onSort}
        >
          {children}
          <SortIcon sortOrder={sortOrder} />
        </button>
      ) : (
        children
      )}
    </th>
  )
}
