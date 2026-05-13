import type { FC } from 'react'
import PageHeading from '@/components/PageHeading'
import NotificationStatusTable from '@/components/NotificationStatusTable'
import { Col, Row } from 'react-bootstrap'

const Dashboard: FC = () => {
  return (
    <div>
      <PageHeading title="Dashboard" />
      <Row>
        <Col md={12}>
          <NotificationStatusTable />
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
