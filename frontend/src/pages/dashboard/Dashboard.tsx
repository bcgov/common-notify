import { useEffect } from 'react'
import type { FC } from 'react'
import { Button, Form, Select, TextField } from '@bcgov/design-system-react-components'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Col, Row, Table } from 'react-bootstrap'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchNotifications } from '@/redux/thunks/notification.thunks'
import { setStatusFilter, selectFilteredNotifications } from '@/redux/slices/notification.slice'
import { NotificationStatus } from '@/enum/notification-status.enum'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

const mockNotificationEvents = [
  { id: 1, name: 'Graduates Outcome Survey' },
  { id: 2, name: 'Employer Followup Survey' },
  { id: 3, name: 'Internal Team Alert' },
]

const notificationEventItems = mockNotificationEvents.map((ws) => ({ id: ws.id, label: ws.name }))

const columnHelper = createColumnHelper<NotificationRequest>()

const columns = [
  columnHelper.accessor('tenantId', {
    header: 'Tenant ID',
    cell: ({ getValue }) => (
      <Link to="/" style={{ color: 'black', fontFamily: 'monospace' }}>
        {getValue().slice(0, 8)}&hellip;
      </Link>
    ),
  }),
  columnHelper.accessor('status', { header: 'Status' }),
  columnHelper.accessor('createdAt', {
    header: 'Created',
    cell: ({ getValue }) => new Date(getValue()).toLocaleString(),
  }),
]

const statusFilterItems = [
  { id: 'all', label: 'All' },
  ...Object.values(NotificationStatus).map((s) => ({
    id: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
  })),
]

const Dashboard: FC = () => {
  const dispatch = useAppDispatch()
  const { statusFilter, isLoading, error } = useAppSelector((state) => state.notification)
  const filteredNotifications = useAppSelector(selectFilteredNotifications)

  useEffect(() => {
    dispatch(fetchNotifications())
  }, [dispatch])

  const table = useReactTable({
    data: filteredNotifications,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div>
      {/* Page heading */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h1 className="fw-bold mb-0">Dashboard</h1>
      </div>

      {/* Notification Events list + Send Test Notification */}
      <Row className="mb-5">
        <Col md={6}>
          <h2 className="h4 fw-bold mb-3">Notification Events</h2>
          <ul className="list-unstyled d-flex flex-column gap-2">
            {mockNotificationEvents.map((ws) => (
              <li key={ws.id}>
                <Link to="/notification-events" className="text-secondary">
                  {ws.name}
                </Link>
              </li>
            ))}
          </ul>
        </Col>
        <Col md={2}></Col>
        <Col md={4}>
          <div className="bg-light rounded p-4">
            <h3 className="h5 fw-bold mb-3">Send Test Notification</h3>
            <Form className="d-flex flex-column gap-3">
              <Select
                label="Notification Events"
                placeholder="select..."
                items={notificationEventItems}
                style={{ width: '100%' }}
              />
              <Select
                label="Recipients"
                placeholder="select..."
                items={[]}
                style={{ width: '100%' }}
              />
              <Select
                label="Notification Template"
                placeholder="select..."
                items={[]}
                style={{ width: '100%' }}
              />
              <TextField label="Subject/Title" style={{ width: '100%' }} />
              <Button variant="primary" type="submit" style={{ width: '100%' }}>
                Preview &amp; Send
              </Button>
            </Form>
          </div>
        </Col>
      </Row>

      {/* Notification Status */}
      <Row>
        <Col md={12}>
          <h2 className="h4 fw-bold mb-3">Notification Status</h2>
          {/* {error && <p className="text-danger">{error}</p>} */}
          <div className="mb-3" style={{ maxWidth: '220px' }}>
            <Select
              label="Filter by status"
              items={statusFilterItems}
              selectedKey={statusFilter}
              onSelectionChange={(key) =>
                dispatch(setStatusFilter(key as NotificationStatus | 'all'))
              }
            />
          </div>
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
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="text-center">
                    Loading...
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
