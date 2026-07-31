import type { FC } from 'react'
import NotificationStatusTable from './NotificationStatusTable'
import PageSubHeading from '../../../components/PageSubHeading'

/**
 * Used on the Homepage
 */
export const NotificationStatusSection: FC = () => {
  return (
    <section>
      <PageSubHeading title="Notification Status" />
      <NotificationStatusTable />
    </section>
  )
}
