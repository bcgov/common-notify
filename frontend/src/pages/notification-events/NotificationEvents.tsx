import { useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, TextField } from '@bcgov/design-system-react-components'
import { Link } from '@tanstack/react-router'
import { Col, Row, Table } from 'react-bootstrap'

const mockNotificationEvents = [
  { id: 1, name: 'Graduates Outcome Survey', lastUpdated: 'Feb 1, 10:45 AM', format: 'Email' },
  { id: 2, name: 'Employer Followup Survey', lastUpdated: 'Feb 1, 10:45 AM', format: 'SMS' },
  { id: 3, name: 'Internal Team Alert', lastUpdated: 'Feb 1, 10:45 AM', format: 'Email' },
]

const NotificationEvents: FC = () => {
  const [search, setSearch] = useState('')

  const filteredNotificationEvents = useMemo(
    () =>
      mockNotificationEvents.filter((ws) => ws.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  )

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
          <tr>
            <th>Notification Events Title</th>
            <th>Last updated</th>
            <th>Format</th>
          </tr>
        </thead>
        <tbody>
          {filteredNotificationEvents.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to="/notification-events" style={{ color: 'black' }}>
                  {row.name}
                </Link>
              </td>
              <td>{row.lastUpdated}</td>
              <td>{row.format}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

export default NotificationEvents
