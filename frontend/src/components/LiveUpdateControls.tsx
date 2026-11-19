import type { FC } from 'react'
import { Button, Switch } from '@bcgov/design-system-react-components'
import type { LiveStatus } from '@/hooks/useLiveUpdates'
import '@/scss/components/live-update-controls.scss'

interface LiveUpdateControlsProps {
  status: LiveStatus
  isOn: boolean
  onToggle: (on: boolean) => void
  onRefresh: () => void
  isRefreshing: boolean
  /** When the data on screen was produced; omitted until the first load. */
  updatedAt?: string
  /** How often the page polls when the stream is down, for the status text. */
  fallbackSeconds: number
}

/**
 * The toolbar for a page fed by useLiveUpdates: when it last updated, whether the stream is up,
 * a switch to pause it, and a Refresh button for when it is not live.
 */
const LiveUpdateControls: FC<LiveUpdateControlsProps> = ({
  status,
  isOn,
  onToggle,
  onRefresh,
  isRefreshing,
  updatedAt,
  fallbackSeconds,
}) => {
  const statusText: Record<LiveStatus, string> = {
    off: 'Paused',
    connecting: 'Connecting…',
    live: 'Live',
    reconnecting: `Reconnecting… (updating every ${fallbackSeconds}s)`,
    unavailable: `Live updates unavailable (updating every ${fallbackSeconds}s)`,
  }

  return (
    <div className="live-update-controls">
      {updatedAt && <span>Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
      <span className="live-update-controls__status" data-status={status}>
        {statusText[status]}
      </span>
      <Switch isSelected={isOn} onChange={onToggle}>
        Live updates
      </Switch>
      {/* A live stream already refetches on every change; manual refresh is for when it isn't. */}
      {status !== 'live' && (
        <Button variant="secondary" size="small" onPress={onRefresh} isDisabled={isRefreshing}>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      )}
    </div>
  )
}

export default LiveUpdateControls
