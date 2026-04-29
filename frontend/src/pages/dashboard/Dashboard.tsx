import { useEffect } from 'react'
import type { FC } from 'react'
import { Button, Form, Select, TextField } from '@bcgov/design-system-react-components'
import { Link } from '@tanstack/react-router'
import { Col, Row, Table } from 'react-bootstrap'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchNotifications } from '@/redux/thunks/notification.thunks'
import { setStatusFilter, selectFilteredNotifications } from '@/redux/slices/notification.slice'
import { selectStatuses } from '@/redux/slices/codeTables.slice'
import type { NotificationStatus } from '@/enum/notification-status.enum'

const mockNotificationEvents = [
  { id: 1, name: 'Graduates Outcome Survey' },
  { id: 2, name: 'Employer Followup Survey' },
  { id: 3, name: 'Internal Team Alert' },
]

const notificationEventItems = mockNotificationEvents.map((ws) => ({ id: ws.id, label: ws.name }))

const Dashboard: FC = () => {
  const dispatch = useAppDispatch()
  const { statusFilter, isLoading } = useAppSelector((state) => state.notification)
  const filteredNotifications = useAppSelector(selectFilteredNotifications)
  const statuses = useAppSelector(selectStatuses)

  // Build status filter items from Redux
  const statusFilterItems = [
    { id: 'all', label: 'All' },
    ...statuses.map((s) => ({
      id: s.id,
      label: s.label,
    })),
  ]

  useEffect(() => {
    dispatch(fetchNotifications())
  }, [dispatch])

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
              <tr>
                <th>Tenant ID</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="text-center">
                    Loading...
                  </td>
                </tr>
              ) : (
                filteredNotifications.map((row) => (
                  <tr key={row.id}>
                    <td>{row.tenantId}</td>
                    <td>{row.status}</td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
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
