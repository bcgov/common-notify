import type { FC } from 'react'
import MonitoringPage from './MonitoringPage'
import QueuesSection from './sections/QueuesSection'
import SendsInProgressSection from './sections/SendsInProgressSection'
import WorkersSection from './sections/WorkersSection'
import ReconcilerSection from './sections/ReconcilerSection'

/** The Bull queues, the sends moving through them, the pods working them, and recoveries. */
const QueuesAndProcessing: FC = () => (
  <MonitoringPage
    page="queues"
    title="Queues & processing"
    meta="Jobs waiting and running, the pods working them, and what was recovered. Read-only."
  >
    {(data, now) => (
      <>
        <QueuesSection queues={data.queues} />
        <SendsInProgressSection sends={data.sendsInProgress} now={now} />
        <WorkersSection workers={data.workers} now={now} />
        <ReconcilerSection reconciler={data.reconciler} now={now} />
      </>
    )}
  </MonitoringPage>
)

export default QueuesAndProcessing
