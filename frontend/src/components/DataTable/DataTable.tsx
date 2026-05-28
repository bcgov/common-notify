import type { ReactNode } from 'react'
import TablePaginationFooter from './pagination/TablePaginationFooter'
import { Table } from './Table'
import { TableBody } from './TableBody'
import { TableCell } from './TableCell'
import { TableFooter } from './TableFooter'
import { TableHeader } from './TableHeader'
import { TableHeaderCell } from './TableHeaderCell'
import { TableRow } from './TableRow'

export interface TableColumn<T> {
  key: keyof T & string
  label: string
  sortable?: boolean
  width?: string
  render?: (value: unknown, row: T) => ReactNode
  className?: string
}

export interface TableProps<T> {
  columns: TableColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
  // Sorting
  sortBy?: string
  sortOrder?: 'asc' | 'desc' | null
  onSort?: (key: string, order: 'asc' | 'desc' | null) => void
  // Pagination
  currentPage?: number
  pageSize?: number
  totalCount?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  // Row interaction
  onRowClick?: (row: T) => void
  // State
  isLoading?: boolean
  isEmpty?: boolean
  emptyMessage?: string
  // Accessibility
  label?: string
  // Styling
  variant?: 'striped' | 'bordered' | 'plain'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  // Footer
  footerContent?: ReactNode
}

/**
 * DataTable component
 * - Accepts column definitions + data + key function
 * - Sorting is not implemented, onSort will be implemented by the parent and will likely
 *   involve updating a redux state which fetches new data using filters/orders, meaning
 *   data is sorted & filtered in the backend and all we do is display it
 * - Pagination is part of another ticket and will be integrated soon
 * - Render loading / empty states and allow for custom 'no data' message
 * - Styling with preset variants, sizes, as well as custom styling through classes
 * - footerContent can be passed in, may integrate pagination inside it by default
 */
export function DataTable<T extends object>({
  columns,
  data,
  keyExtractor,
  sortBy,
  sortOrder,
  onSort,
  isLoading = false,
  isEmpty,
  emptyMessage = 'No data available.',
  currentPage,
  pageSize = 15,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  label,
  variant = 'striped',
  size = 'md',
  className = '',
  footerContent,
}: TableProps<T>) {
  data = data ?? []
  // Cycle through sort options null -> asc -> desc -> null for the key
  function handleSort(key: string) {
    let order: 'asc' | 'desc' | null
    if (sortBy !== key || sortOrder == null) order = 'asc'
    else if (sortOrder === 'asc') order = 'desc'
    else order = null
    onSort?.(key, order)
  }

  const showEmpty = !isLoading && (isEmpty || data.length === 0)

  function renderBodyContent() {
    if (isLoading) {
      return (
        <TableRow className="data-table__loading-row">
          <TableCell colSpan={columns.length}>Loading...</TableCell>
        </TableRow>
      )
    }

    if (showEmpty) {
      return (
        <TableRow className="data-table__empty-row">
          <TableCell colSpan={columns.length}>{emptyMessage}</TableCell>
        </TableRow>
      )
    }

    return data.map((row) => (
      <TableRow key={keyExtractor(row)}>
        {columns.map((col) => {
          const rawValue = row[col.key as keyof T]
          const cell = col.render ? col.render(rawValue, row) : String(rawValue ?? '')
          return (
            <TableCell
              key={col.key}
              className={col.className}
              style={col.width ? { width: col.width } : undefined}
            >
              {cell}
            </TableCell>
          )
        })}
      </TableRow>
    ))
  }

  const statusMessage = isLoading
    ? 'Loading'
    : showEmpty
      ? emptyMessage
      : `${data.length} row${data.length === 1 ? '' : 's'}`

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {statusMessage}
      </div>
      <Table variant={variant} size={size} className={className} aria-label={label}>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHeaderCell
                key={col.key}
                className={col.className}
                style={col.width ? { width: col.width } : undefined}
                sortable={col.sortable}
                sortOrder={sortBy === col.key ? sortOrder : null}
                onSort={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{renderBodyContent()}</TableBody>
        {(footerContent != null ||
          (onPageChange != null && totalCount != null && currentPage != null)) && (
          <TableFooter>
            {footerContent != null && (
              <TableRow>
                <TableCell colSpan={columns.length}>{footerContent}</TableCell>
              </TableRow>
            )}
            {onPageChange != null && totalCount != null && currentPage != null && (
              <TableRow>
                <TableCell colSpan={columns.length} style={{ padding: 0 }}>
                  <TablePaginationFooter
                    page={currentPage}
                    totalPages={Math.ceil(totalCount / pageSize)}
                    count={totalCount}
                    limit={pageSize}
                    isLoading={isLoading}
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageSizeChange}
                    pageSizeOptions={pageSizeOptions}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableFooter>
        )}
      </Table>
    </>
  )
}

export default DataTable
