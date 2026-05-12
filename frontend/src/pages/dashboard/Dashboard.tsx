import type { FC } from 'react'
import { useAppSelector } from '@/redux/hooks'
import PageHeading from '@/components/PageHeading'
import { Col, Row } from 'react-bootstrap'
import TestNotificationForm from '@/components/TestNotificationForm'
import { NotificationStatusSection } from '@/pages/dashboard/sections/NotificationStatusSection'
import { NotificationEventsSection } from '@/pages/dashboard/sections/NotificationEventsSection'

const Dashboard: FC = () => {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  return (
    <div>
      <PageHeading title={selectedTenant ? selectedTenant.name : 'Dashboard'} />

      <Row className="mb-5">
        <Col md={7}>
          <NotificationEventsSection />
        </Col>
        <Col md={5}>
          <TestNotificationForm />
        </Col>
      </Row>

      <Row>
        <Col md={12}>
          <NotificationStatusSection />
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
