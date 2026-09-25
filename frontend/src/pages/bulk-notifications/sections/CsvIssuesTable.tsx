import { useState } from 'react'
import type { FC } from 'react'
import { InlineAlert } from '@bcgov/design-system-react-components'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import IssueMessage from '@/components/IssueMessage/IssueMessage'
import type { RowIssue } from '@/utils/bulkNotificationsCsv'

interface IssueRow extends RowIssue {
  id: number
}

type IssueSort = { key: keyof IssueRow & string; order: 'asc' | 'desc' | null }

const issueColumns: TableColumn<IssueRow>[] = [
  { key: 'row', label: 'Row', width: '90px', sortable: true, sortType: 'numeric' },
  { key: 'column', label: 'Column', width: '160px', sortable: true },
  {
    key: 'value',
    label: 'Value found',
    sortable: true,
    // An empty cell reads as a dash, so a missing value is visibly missing rather than blank.
    render: (_, issue) => <span>{issue.value ?? '–'}</span>,
  },
  {
    key: 'title',
    label: 'Issue',
    width: '340px',
    sortable: true,
    // Sorted on the title alone - the detail restates it, so sorting by the full text would
    // group rows no differently while making the order harder to predict.
    render: (_, issue) => <IssueMessage title={issue.title} detail={issue.detail} />,
  },
]

/** Sort the issue rows in place of a server round-trip - the whole list is already in memory. */
function sortIssues(rows: IssueRow[], sort: IssueSort): IssueRow[] {
  if (!sort.order) {
    return rows
  }

  const direction = sort.order === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    const left = a[sort.key]
    const right = b[sort.key]

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * direction
    }

    // Undefined values (an empty cell) sort last regardless of direction, so the rows a user can
    // act on stay together at the top.
    if (left === undefined) return 1
    if (right === undefined) return -1

    return String(left).localeCompare(String(right)) * direction
  })
}

interface Props {
  issues: RowIssue[]
}

/**
 * The row-level problems found in an uploaded CSV: a count the user can act on, and the sortable
 * table beneath it.
 *
 * Each row states the problem as a title with the fix beneath it.
 *
 * Sort order is local because it is presentation only - the page decides which rows are wrong,
 * this decides how they are read. Renders nothing when the file is clean, so the caller does not
 * repeat the empty check.
 */
const CsvIssuesTable: FC<Props> = ({ issues }) => {
  const [sort, setSort] = useState<IssueSort>({ key: 'row', order: 'asc' })

  if (issues.length === 0) {
    return null
  }

  const rows = sortIssues(
    issues.map((issue, index) => ({ ...issue, id: index })),
    sort,
  )

  return (
    <>
      <InlineAlert
        variant="warning"
        title={
          issues.length === 1
            ? '1 item requires attention.'
            : `${issues.length} items require attention.`
        }
        description="Review the items below. To make changes, update your CSV and upload a revised file above."
      />
      <DataTable
        columns={issueColumns}
        data={rows}
        keyExtractor={(issue) => issue.id}
        label="Problems found in the uploaded file"
        sortBy={sort.order ? sort.key : undefined}
        sortOrder={sort.order}
        onSort={(key, order) => setSort({ key: key as keyof IssueRow & string, order })}
        size="sm"
        // The Issue cell is a title over its fix, so rows are taller than one line.
        multiline
      />
    </>
  )
}

export default CsvIssuesTable
