import { useEffect } from 'react'
import type { FC } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchNotifications } from '@/redux/thunks/notification.thunks'
import PageHeading from '@/components/PageHeading'
import NotificationStatusTable from '@/components/NotificationStatusTable'
import { Col, Row } from 'react-bootstrap'

const Dashboard: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchNotifications())
    }
  }, [dispatch, selectedTenant])

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
