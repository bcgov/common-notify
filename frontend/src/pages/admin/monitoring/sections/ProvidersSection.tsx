import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import { StatusBadge } from '@/components/StatusBadge'
import StatTile from '@/components/StatTile'
import type { ProviderStats } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatMessageChannel } from '@/utils/monitoring'

const CIRCUIT_LABELS: Record<NonNullable<ProviderStats['circuit']>, string> = {
  closed: 'Sending',
  open: 'Paused: provider failing',
  'half-open': 'Testing recovery',
}

/** "CHES (Email)". */
export function providerLabel(provider: ProviderStats): string {
  return `${provider.name} (${formatMessageChannel(provider.channel)})`
}

function inFlightText(provider: ProviderStats): string | null {
  if (provider.inFlight === null) return null
  return provider.limit
    ? `${provider.inFlight.toLocaleString()} of ${provider.limit.toLocaleString()}`
    : provider.inFlight.toLocaleString()
}

interface ProvidersSectionProps {
  providers: ProviderStats[]
}

/** Each delivery provider: whether sends are flowing to it, and how many are in flight. */
const ProvidersSection: FC<ProvidersSectionProps> = ({ providers }) => (
  <section className="page__section">
    <PageSubHeading title="Delivery providers" />
    <div className="page__section-body">
      {providers.map((provider) => {
        const inFlight = inFlightText(provider)
        return (
          <div key={provider.name} className="queue-monitoring__provider">
            <div className="queue-monitoring__memory-caption">
              <span>{providerLabel(provider)}</span>
              <StatusBadge status={provider.status} statusLabel={HEALTH_LABELS[provider.status]} />
            </div>
            {provider.reasons.length > 0 && (
              <ul className="queue-monitoring__reasons">
                {provider.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <dl className="stat-tile-grid">
              <StatTile
                label="Circuit"
                value={provider.circuit ? CIRCUIT_LABELS[provider.circuit] : 'Unknown'}
                hint={
                  provider.reopensAt
                    ? `Test send at ${new Date(provider.reopensAt).toLocaleTimeString()}`
                    : undefined
                }
              />
              {inFlight !== null && (
                <StatTile
                  label="Requests in flight"
                  value={inFlight}
                  hint={provider.limit ? undefined : 'No limit set'}
                />
              )}
            </dl>
          </div>
        )
      })}
      <p className="queue-monitoring__legend">
        When a provider fails several sends in a row, every pod stops sending to it. Messages wait
        rather than fail; after a pause one test send checks whether it has recovered, and sending
        resumes when it succeeds. CHES requests are also capped across all pods, because CHES
        accepts emails at a fixed pace and more at once only makes each one slower.
      </p>
    </div>
  </section>
)

export default ProvidersSection
