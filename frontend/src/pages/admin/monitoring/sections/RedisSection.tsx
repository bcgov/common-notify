import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import StatTile from '@/components/StatTile'
import type { RedisStats } from '@/interfaces/queueMonitoring.interface'
import { formatBytes, formatDuration } from '@/utils/monitoring'

interface RedisSectionProps {
  redis: RedisStats
}

const RedisSection: FC<RedisSectionProps> = ({ redis }) => {
  return (
    <section className="page__section">
      <PageSubHeading title="Redis" />
      <div className="page__section-body">
        {/* Memory and status are on the Overview; this is the detail behind them. */}
        {redis.reasons.length > 0 && (
          <ul className="queue-monitoring__reasons">
            {redis.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        <dl className="stat-tile-grid">
          <StatTile label="Peak memory" value={formatBytes(redis.peakMemoryBytes)} />
          <StatTile
            label="Connections"
            value={redis.connectedClients.toLocaleString()}
            hint={`${redis.blockedClients.toLocaleString()} idle workers listening`}
          />
          <StatTile
            label="Rejected connections"
            value={redis.rejectedConnections.toLocaleString()}
          />
          <StatTile label="Operations" value={`${redis.opsPerSecond.toLocaleString()}/s`} />
          <StatTile
            label="Uptime"
            value={formatDuration(redis.uptimeSeconds * 1000)}
            hint={`Redis ${redis.version}`}
          />
        </dl>
      </div>
    </section>
  )
}

export default RedisSection
