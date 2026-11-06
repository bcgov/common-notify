import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import ComponentStatusList from '@/components/ComponentStatusList'
import { componentStatuses } from '@/utils/monitoring'
import MonitoringPage from './MonitoringPage'
import OverviewCards from './sections/OverviewCards'
import MessagesSection from './sections/MessagesSection'
import RecentFailuresSection from './sections/RecentFailuresSection'

/** The admin landing page: is Notify healthy, how much is it sending, and what is failing. */
const AdminOverview: FC = () => (
  <MonitoringPage
    page="overview"
    title="Overview"
    meta="Notification delivery across every pod. Read-only."
  >
    {(data, now) => (
      <>
        <OverviewCards overview={data.overview} messages={data.messages} redis={data.redis} />
        <section className="page__section">
          <PageSubHeading title="Components" />
          <ComponentStatusList groups={componentStatuses(data)} />
        </section>
        <MessagesSection messages={data.messages} />
        <RecentFailuresSection failures={data.recentFailures} now={now} />
      </>
    )}
  </MonitoringPage>
)

export default AdminOverview
