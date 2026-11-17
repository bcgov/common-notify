import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import MeterBar from '@/components/MeterBar'
import { StatusBadge } from '@/components/StatusBadge'
import type { RedisStats } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatBytes } from '@/utils/monitoring'

interface RedisSectionProps {
  redis: RedisStats
}

function memoryText(redis: RedisStats): string {
  const used = formatBytes(redis.usedMemoryBytes)
  const peak = `peak ${formatBytes(redis.peakMemoryBytes)}`
  if (redis.maxMemoryBytes === null) return `${used} used, no cap set, ${peak}`
  return `${used} of ${formatBytes(redis.maxMemoryBytes)} (${redis.usedMemoryPercent}%), ${peak}`
}

const RedisSection: FC<RedisSectionProps> = ({ redis }) => {
  const memory = memoryText(redis)
  return (
    <section className="page__section">
      <PageSubHeading title="Redis" />
      <div className="page__section-body">
        <StatusBadge status={redis.status} statusLabel={HEALTH_LABELS[redis.status]} />
        {redis.maxMemoryBytes !== null && redis.usedMemoryPercent !== null && (
          <MeterBar
            label="Redis memory used"
            percent={redis.usedMemoryPercent}
            markerPercent={(redis.peakMemoryBytes / redis.maxMemoryBytes) * 100}
            valueText={memory}
            status={redis.status}
          />
        )}
        <p>Memory: {memory}</p>
        {redis.reasons.length > 0 && (
          <ul className="queue-monitoring__reasons">
            {redis.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default RedisSection
