import type { FC } from 'react'
import MonitoringPage from './MonitoringPage'
import QueuesSection from './sections/QueuesSection'
import SendsInProgressSection from './sections/SendsInProgressSection'
import WorkersSection from './sections/WorkersSection'
import ReconcilerSection from './sections/ReconcilerSection'
import RedisSection from './sections/RedisSection'

/** The detail behind each component on the Overview, for when one of them needs a closer look. */
const System: FC = () => (
  <MonitoringPage page="system" title="System">
    {(data, now) => (
      <>
        <QueuesSection queues={data.queues} />
        <SendsInProgressSection sends={data.sendsInProgress} now={now} />
        <WorkersSection workers={data.workers} now={now} />
        <ReconcilerSection reconciler={data.reconciler} now={now} />
        <RedisSection redis={data.redis} />
      </>
    )}
  </MonitoringPage>
)

export default System
