import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import StatTile from '@/components/StatTile'
import MeterBar from '@/components/MeterBar'
import { StatusBadge } from '@/components/StatusBadge'
import type { RedisStats } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatBytes, formatDuration } from '@/utils/monitoring'

interface RedisSectionProps {
  redis: RedisStats
}

function memoryText(redis: RedisStats): string {
  const used = formatBytes(redis.usedMemoryBytes)
  return redis.maxMemoryBytes === null
    ? `${used} used, no cap set`
    : `${used} of ${formatBytes(redis.maxMemoryBytes)}`
}

const RedisSection: FC<RedisSectionProps> = ({ redis }) => {
  const memory = memoryText(redis)
  return (
    <section className="page__section">
      <PageSubHeading title="Redis" />
      <div className="page__section-body">
        <StatusBadge status={redis.status} statusLabel={HEALTH_LABELS[redis.status]} />
        {redis.usedMemoryPercent !== null && (
          <MeterBar
            label="Redis memory used"
            percent={redis.usedMemoryPercent}
            valueText={`${memory} (${redis.usedMemoryPercent}%)`}
            status={redis.status}
          />
        )}
        <p>
          Memory: {memory}
          {redis.usedMemoryPercent !== null && ` (${redis.usedMemoryPercent}%)`}
        </p>
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
