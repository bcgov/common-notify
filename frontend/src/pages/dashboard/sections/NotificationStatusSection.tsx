import type { FC } from 'react'
import NotificationStatusTable from '../../../components/NotificationStatusTable'
import PageSubHeading from '../../../components/PageSubHeading'

/**
 * Used on the Dashboard page
 */
export const NotificationStatusSection: FC = () => {
  return (
    <section>
      <PageSubHeading title="Notification Status" />
      <NotificationStatusTable />
    </section>
  )
}
