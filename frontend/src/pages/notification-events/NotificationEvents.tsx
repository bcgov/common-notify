import { useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, TextField } from '@bcgov/design-system-react-components'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Col, Row, Table } from 'react-bootstrap'

const mockNotificationEvents = [
  { id: 1, name: 'Graduates Outcome Survey', lastUpdated: 'Feb 1, 10:45 AM', format: 'Email' },
  { id: 2, name: 'Employer Followup Survey', lastUpdated: 'Feb 1, 10:45 AM', format: 'SMS' },
  { id: 3, name: 'Internal Team Alert', lastUpdated: 'Feb 1, 10:45 AM', format: 'Email' },
]

type NotificationEventRow = (typeof mockNotificationEvents)[number]

const columnHelper = createColumnHelper<NotificationEventRow>()

const columns = [
  columnHelper.accessor('name', {
    header: 'Notification Events Title',
    cell: ({ getValue }) => (
      <Link to="/notification-events" style={{ color: 'black' }}>
        {getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor('lastUpdated', { header: 'Last updated' }),
  columnHelper.accessor('format', { header: 'Format' }),
]

const NotificationEvents: FC = () => {
  const [search, setSearch] = useState('')

  // Basic filter on the table contents
  const filteredNotificationEvents = useMemo(
    () =>
      mockNotificationEvents.filter((ws) => ws.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  )

  const table = useReactTable({
    data: filteredNotificationEvents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div>
      <h1 className="fw-bold mb-4">Notification Events</h1>

      <Row className="align-items-center mb-4">
        <Col md="auto">
          {/** placeholder option works but bcgov component doesn't recognize it */}
          <TextField
            aria-label="Search Notification Events"
            value={search}
            onChange={(val) => setSearch(val)}
            style={{ width: '400px' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ placeholder: 'Search Notification Events...' } as any)}
          />
        </Col>
        <Col className="d-flex justify-content-end">
          <Button variant="primary" type="button">
            Create New Event
          </Button>
        </Col>
      </Row>

      <Table bordered hover responsive>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

export default NotificationEvents
