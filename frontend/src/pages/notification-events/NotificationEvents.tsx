import { useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, TextField } from '@bcgov/design-system-react-components'
import { Link } from '@tanstack/react-router'
import { Col, Row } from 'react-bootstrap'
import PageHeading from '@/components/PageHeading'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'

interface NotificationEvent {
  id: number
  name: string
  lastUpdated: string
  format: string
}

const mockNotificationEvents: NotificationEvent[] = [
  { id: 1, name: 'Graduates Outcome Survey', lastUpdated: 'Feb 1, 10:45 AM', format: 'Email' },
  { id: 2, name: 'Employer Followup Survey', lastUpdated: 'Feb 1, 10:45 AM', format: 'SMS' },
  { id: 3, name: 'Internal Team Alert', lastUpdated: 'Feb 1, 10:45 AM', format: 'Email' },
]

const columns: TableColumn<NotificationEvent>[] = [
  {
    key: 'name',
    label: 'Notification Events Title',
    render: (_, row) => (
      <Link to="/notification-events" style={{ color: 'black' }}>
        {row.name}
      </Link>
    ),
  },
  {
    key: 'lastUpdated',
    label: 'Last updated',
  },
  {
    key: 'format',
    label: 'Format',
  },
]

const NotificationEvents: FC = () => {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 15

  const filteredNotificationEvents = useMemo(
    () =>
      mockNotificationEvents.filter((ws) => ws.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  )

  return (
    <div>
      <PageHeading title="Notification Events" />

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

      <DataTable
        columns={columns}
        data={filteredNotificationEvents}
        keyExtractor={(row) => row.id}
        label="Notification Events"
        emptyMessage="No notification events found"
        currentPage={page}
        pageSize={pageSize}
        totalCount={filteredNotificationEvents.length}
        onPageChange={setPage}
      />
    </div>
  )
}

export default NotificationEvents
