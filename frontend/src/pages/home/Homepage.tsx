import type { FC } from 'react'
import { useAppSelector } from '@/redux/hooks'
import PageHeading from '@/components/PageHeading'
import { Col, Row } from 'react-bootstrap'
import { NotificationTemplatesSection } from '../dashboard/sections/NotificationTemplatesSection'
import { NotificationStatusSection } from '../dashboard/sections/NotificationStatusSection'

const Homepage: FC = () => {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  return (
    <div>
      <PageHeading title={selectedTenant ? selectedTenant.name : 'Homepage'} />

      <Row className="mb-5">
        <Col md={12}>
          <NotificationTemplatesSection />
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

export default Homepage
