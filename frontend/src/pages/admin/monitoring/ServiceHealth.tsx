import type { FC } from 'react'
import MonitoringPage from './MonitoringPage'
import ProvidersSection from './sections/ProvidersSection'
import RedisSection from './sections/RedisSection'

/** The services Notify sends through and keeps its queues in. */
const ServiceHealth: FC = () => (
  <MonitoringPage
    page="health"
    title="Service health"
    meta="The delivery providers and the Redis instance, as every pod sees them."
  >
    {(data) => (
      <>
        <ProvidersSection providers={data.providers} />
        <RedisSection redis={data.redis} />
      </>
    )}
  </MonitoringPage>
)

export default ServiceHealth
