import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable } from './DataTable'

vi.mock('@mui/icons-material/KeyboardArrowDown', () => ({ default: () => <span>▼</span> }))
vi.mock('@mui/icons-material/KeyboardArrowUp', () => ({ default: () => <span>▲</span> }))
vi.mock('@mui/icons-material/UnfoldMore', () => ({ default: () => <span>⇅</span> }))

interface Row {
  id: number
  name: string
  status: string
}

const columns = [
  { key: 'name' as const, label: 'Name' },
  { key: 'status' as const, label: 'Status' },
]

const data: Row[] = [
  { id: 1, name: 'Alice', status: 'active' },
  { id: 2, name: 'Bob', status: 'inactive' },
]

const keyExtractor = (row: Row) => row.id

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DataTable', () => {
  describe('column headers', () => {
    it('renders all column headers', () => {
      render(<DataTable columns={columns} data={data} keyExtractor={keyExtractor} />)

      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    })
  })

  describe('data rows', () => {
    it('renders a row for each data item', () => {
      render(<DataTable columns={columns} data={data} keyExtractor={keyExtractor} />)

      expect(screen.getByRole('cell', { name: 'Alice' })).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'active' })).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'Bob' })).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'inactive' })).toBeInTheDocument()
    })

    it('uses a custom render function for a column', () => {
      const columnsWithRender = [
        { key: 'name' as const, label: 'Name' },
        {
          key: 'status' as const,
          label: 'Status',
          render: (_: unknown, row: Row) => (
            <span data-testid="badge">{row.status.toUpperCase()}</span>
          ),
        },
      ]

      render(<DataTable columns={columnsWithRender} data={data} keyExtractor={keyExtractor} />)

      const badges = screen.getAllByTestId('badge')
      expect(badges).toHaveLength(2)
      expect(badges[0]).toHaveTextContent('ACTIVE')
    })
  })

  describe('empty state', () => {
    it('shows the default empty message when data is empty', () => {
      render(<DataTable columns={columns} data={[]} keyExtractor={keyExtractor} />)

      expect(screen.getByRole('cell', { name: 'No data available.' })).toBeInTheDocument()
    })

    it('shows a custom empty message', () => {
      render(
        <DataTable
          columns={columns}
          data={[]}
          keyExtractor={keyExtractor}
          emptyMessage="Nothing to see here."
        />,
      )

      expect(screen.getByRole('cell', { name: 'Nothing to see here.' })).toBeInTheDocument()
    })

    it('shows the empty message when isEmpty is true even with data', () => {
      render(<DataTable columns={columns} data={data} keyExtractor={keyExtractor} isEmpty />)

      expect(screen.getByRole('cell', { name: 'No data available.' })).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows a loading indicator when isLoading is true', () => {
      render(<DataTable columns={columns} data={[]} keyExtractor={keyExtractor} isLoading />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('does not show the empty message while loading', () => {
      render(
        <DataTable
          columns={columns}
          data={[]}
          keyExtractor={keyExtractor}
          isLoading
          emptyMessage="Nothing here."
        />,
      )

      expect(screen.queryByText('Nothing here.')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('sets aria-label on the table from the label prop', () => {
      render(
        <DataTable columns={columns} data={data} keyExtractor={keyExtractor} label="Users table" />,
      )

      expect(screen.getByRole('table', { name: 'Users table' })).toBeInTheDocument()
    })

    it('announces row count in the live region', () => {
      render(<DataTable columns={columns} data={data} keyExtractor={keyExtractor} />)

      expect(screen.getByText('2 rows')).toBeInTheDocument()
    })

    it('announces singular row count correctly', () => {
      render(<DataTable columns={columns} data={[data[0]]} keyExtractor={keyExtractor} />)

      expect(screen.getByText('1 row')).toBeInTheDocument()
    })

    it('announces loading in the live region', () => {
      render(<DataTable columns={columns} data={[]} keyExtractor={keyExtractor} isLoading />)

      expect(screen.getByText('Loading')).toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    const sortableColumns = [
      { key: 'name' as const, label: 'Name', sortable: true },
      { key: 'status' as const, label: 'Status' },
    ]

    it('renders a column options button for sortable columns', () => {
      render(<DataTable columns={sortableColumns} data={data} keyExtractor={keyExtractor} />)

      expect(screen.getByRole('button', { name: /column options for name/i })).toBeInTheDocument()
    })

    it('does not render a column options button for non-sortable columns', () => {
      render(<DataTable columns={sortableColumns} data={data} keyExtractor={keyExtractor} />)

      expect(
        screen.queryByRole('button', { name: /column options for status/i }),
      ).not.toBeInTheDocument()
    })

    it('calls onSort with asc when clicking A to Z on an unsorted column', async () => {
      const onSort = vi.fn()
      render(
        <DataTable
          columns={sortableColumns}
          data={data}
          keyExtractor={keyExtractor}
          onSort={onSort}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: /column options for name/i }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'A to Z' }))

      expect(onSort).toHaveBeenCalledWith('name', 'asc')
    })

    it('calls onSort with desc when clicking Z to A', async () => {
      const onSort = vi.fn()
      render(
        <DataTable
          columns={sortableColumns}
          data={data}
          keyExtractor={keyExtractor}
          sortBy="name"
          sortOrder="asc"
          onSort={onSort}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: /column options for name/i }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Z to A' }))

      expect(onSort).toHaveBeenCalledWith('name', 'desc')
    })

    it('calls onSort with null when clicking the active sort option to deselect', async () => {
      const onSort = vi.fn()
      render(
        <DataTable
          columns={sortableColumns}
          data={data}
          keyExtractor={keyExtractor}
          sortBy="name"
          sortOrder="desc"
          onSort={onSort}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: /column options for name/i }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Z to A' }))

      expect(onSort).toHaveBeenCalledWith('name', null)
    })

    it('shows Ascending/Descending labels for non-text sortType columns', async () => {
      const dateColumns = [
        { key: 'name' as const, label: 'Name', sortable: true, sortType: 'date' as const },
        { key: 'status' as const, label: 'Status' },
      ]
      render(<DataTable columns={dateColumns} data={data} keyExtractor={keyExtractor} />)

      await userEvent.click(screen.getByRole('button', { name: /column options for name/i }))

      expect(await screen.findByRole('menuitem', { name: 'Ascending' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Descending' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'A to Z' })).not.toBeInTheDocument()
    })

    it('sets aria-sort on the active sort column', () => {
      render(
        <DataTable
          columns={sortableColumns}
          data={data}
          keyExtractor={keyExtractor}
          sortBy="name"
          sortOrder="asc"
        />,
      )

      expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
        'aria-sort',
        'ascending',
      )
    })
  })

  describe('footer', () => {
    it('renders footerContent inside a tfoot', () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          keyExtractor={keyExtractor}
          footerContent={<span>Total: 2</span>}
        />,
      )

      expect(screen.getByText('Total: 2')).toBeInTheDocument()
    })

    it('does not render a tfoot when footerContent is not provided', () => {
      render(<DataTable columns={columns} data={data} keyExtractor={keyExtractor} />)

      expect(screen.queryByRole('rowgroup', { name: /tfoot/i })).not.toBeInTheDocument()
      // tfoot renders as a rowgroup; confirm no extra rowgroups beyond thead/tbody
      const rowgroups = screen.getAllByRole('rowgroup')
      expect(rowgroups).toHaveLength(2) // thead + tbody only
    })
  })

  describe('pagination', () => {
    it('renders PaginationControls when onPageChange, totalCount, and currentPage are provided', () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          keyExtractor={keyExtractor}
          currentPage={1}
          totalCount={20}
          pageSize={10}
          onPageChange={vi.fn()}
        />,
      )

      expect(screen.getByTestId('pagination')).toBeInTheDocument()
      expect(screen.getByTestId('pagination')).toHaveAttribute('data-page', '1')
      expect(screen.getByTestId('pagination')).toHaveAttribute('data-total-pages', '2')
    })

    it('does not render PaginationControls when onPageChange is not provided', () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          keyExtractor={keyExtractor}
          currentPage={1}
          totalCount={20}
        />,
      )

      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })

    it('calls onPageChange when pagination next button is clicked', async () => {
      const onPageChange = vi.fn()
      render(
        <DataTable
          columns={columns}
          data={data}
          keyExtractor={keyExtractor}
          currentPage={1}
          totalCount={20}
          pageSize={10}
          onPageChange={onPageChange}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

      expect(onPageChange).toHaveBeenCalledWith(2)
    })
  })
})
