import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { TableCell } from './TableCell'
import { TableRow } from './TableRow'

type NarrowedBy = 'search' | 'filter'

/** What emptied the table, and how to undo it. */
export interface Narrowing {
  by: NarrowedBy
  clear: () => void
}

const NARROWED = {
  search: { message: 'No results found. Try a different search.', actionLabel: 'Clear search' },
  filter: { message: 'No data match the filters applied.', actionLabel: 'Clear filters' },
}

/** Display the 'clear search' message before the 'clear filter' message if both are applied */
export function getNarrowing(
  search: string | undefined,
  onClearSearch: (() => void) | undefined,
  activeFilters: Record<string, string[]> | undefined,
  onFilter: ((key: string, values: string[]) => void) | undefined,
): Narrowing | null {
  if (search && onClearSearch) {
    return { by: 'search', clear: onClearSearch }
  }
  const filterKeys = Object.keys(activeFilters ?? {})
  if (filterKeys.length > 0 && onFilter) {
    return { by: 'filter', clear: () => filterKeys.forEach((key) => onFilter(key, [])) }
  }
  return null
}

/** The empty-table message, also used for the table's screen-reader status. */
export const getEmptyMessage = (narrowing: Narrowing | null, fallback: string): string =>
  narrowing ? NARROWED[narrowing.by].message : fallback

interface TableEmptyStateProps {
  narrowing: Narrowing | null
  message: string
  colSpan: number
}

const TableEmptyState: FC<TableEmptyStateProps> = ({ narrowing, message, colSpan }) => (
  <TableRow
    className={
      narrowing ? 'data-table__empty-row data-table__empty-row--action' : 'data-table__empty-row'
    }
  >
    <TableCell colSpan={colSpan}>
      {getEmptyMessage(narrowing, message)}
      {narrowing && (
        <Button variant="link" size="small" onPress={narrowing.clear}>
          {NARROWED[narrowing.by].actionLabel}
        </Button>
      )}
    </TableCell>
  </TableRow>
)

export default TableEmptyState
