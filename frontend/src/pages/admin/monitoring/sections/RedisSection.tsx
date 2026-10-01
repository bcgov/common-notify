import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import { StatusBadge } from '@/components/StatusBadge'
import MeterBar from '@/components/MeterBar'
import StatTile from '@/components/StatTile'
import type { RedisStats } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatBytes, formatDuration } from '@/utils/monitoring'

interface RedisSectionProps {
  redis: RedisStats
}

const RedisSection: FC<RedisSectionProps> = ({ redis }) => {
  const used = formatBytes(redis.usedMemoryBytes)
  const memoryText =
    redis.maxMemoryBytes === null
      ? `${used} used (no memory cap set)`
      : `${used} of ${formatBytes(redis.maxMemoryBytes)} (${redis.usedMemoryPercent}%)`

  return (
    <section className="page__section">
      <PageSubHeading title="Redis" />
      <div className="page__section-body">
        <div className="queue-monitoring__memory">
          <div className="queue-monitoring__memory-caption">
            <span>Memory: {memoryText}</span>
            <StatusBadge status={redis.status} statusLabel={HEALTH_LABELS[redis.status]} />
          </div>
          {redis.usedMemoryPercent !== null && (
            <MeterBar
              label="Redis memory used"
              percent={redis.usedMemoryPercent}
              valueText={memoryText}
              status={redis.status}
            />
          )}
          {redis.reasons.length > 0 && (
            <ul className="queue-monitoring__reasons">
              {redis.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>

        <dl className="stat-tile-grid">
          <StatTile label="Peak memory" value={formatBytes(redis.peakMemoryBytes)} />
          <StatTile
            label="Eviction policy"
            value={redis.maxMemoryPolicy}
            hint={redis.maxMemoryPolicy === 'noeviction' ? 'Jobs are never dropped' : undefined}
          />
          <StatTile label="Evicted keys" value={redis.evictedKeys.toLocaleString()} />
          <StatTile
            label="Clients"
            value={redis.connectedClients.toLocaleString()}
            hint={`${redis.blockedClients.toLocaleString()} waiting for jobs`}
          />
          <StatTile
            label="Rejected connections"
            value={redis.rejectedConnections.toLocaleString()}
          />
          <StatTile label="Operations" value={`${redis.opsPerSecond.toLocaleString()}/s`} />
          <StatTile
            label="Fragmentation"
            value={redis.fragmentationRatio === null ? '—' : redis.fragmentationRatio.toFixed(2)}
          />
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
