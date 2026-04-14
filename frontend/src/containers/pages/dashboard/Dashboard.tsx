import { useState } from 'react'
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

const mockWorkspaces = [
  { id: 1, name: 'Graduates Outcome Survey' },
  { id: 2, name: 'Employer Followup Survey' },
  { id: 3, name: 'Internal Team Alert' },
]

const mockNotifications = [
  {
    id: 1,
    workspace: 'Graduates Income...',
    notification: 'Notification title 1',
    recipientList: 'Group ABC',
    status: 'Pending',
    date: 'Feb 1, 10:45 AM',
  },
  {
    id: 2,
    workspace: 'Employer Followup...',
    notification: 'Notification title 2',
    recipientList: 'Group ABC',
    status: 'Delivered',
    date: 'Feb 17, 10:45 AM',
  },
  {
    id: 3,
    workspace: 'Internal Team Alert',
    notification: 'Notification title 3',
    recipientList: 'Group ABC',
    status: 'fail',
    date: '',
  },
]

type NotificationRow = (typeof mockNotifications)[number]

const columnHelper = createColumnHelper<NotificationRow>()

const columns = [
  columnHelper.accessor('workspace', { header: 'Workspaces' }),
  columnHelper.accessor('notification', {
    header: 'Notification',
    cell: ({ getValue }) => (
      <Link to="/" style={{ color: 'black' }}>
        {getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor('recipientList', { header: 'Recipient List' }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: ({ row }) => (
      <>
        {row.original.status}
        {row.original.date && <div className="text-muted small">{row.original.date}</div>}
      </>
    ),
  }),
]

const workspaceItems = mockWorkspaces.map((ws) => ({ id: ws.id, label: ws.name }))

const Dashboard: FC = () => {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | string>(mockWorkspaces[0].id)

  const table = useReactTable({
    data: mockNotifications,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div>
      {/* Page heading + workspace context selector */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h1 className="fw-bold mb-0">Dashboard</h1>
        <div style={{ width: '220px' }}>
          <Select
            aria-label="Active workspace"
            items={workspaceItems}
            value={activeWorkspaceId}
            onChange={(key) => key !== null && setActiveWorkspaceId(key)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Workspaces list + Send Test Notification */}
      <Row className="mb-5">
        <Col md={6}>
          <h2 className="h4 fw-bold mb-3">Workspaces</h2>
          <ul className="list-unstyled d-flex flex-column gap-2">
            {mockWorkspaces.map((ws) => (
              <li key={ws.id}>
                <Link to="/workspaces" className="text-secondary">
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
                label="Workspaces"
                placeholder="select..."
                items={workspaceItems}
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
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
