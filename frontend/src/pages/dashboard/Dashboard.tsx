import { useEffect } from 'react'
import type { FC } from 'react'
import { useAppDispatch } from '@/redux/hooks'
import { fetchNotifications } from '@/redux/thunks/notification.thunks'
import PageHeading from '@/components/PageHeading'
import NotificationStatusTable from '@/components/NotificationStatusTable'
import { Col, Row } from 'react-bootstrap'
import NotificationDeliveryTable from '@/components/NotificationDeliveryTable'

const Dashboard: FC = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(fetchNotifications())
  }, [dispatch])

  return (
    <div>
      <PageHeading title="Dashboard" />
      <Row>
        <Col md={12}>
          <NotificationStatusTable />
          <NotificationDeliveryTable />
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
