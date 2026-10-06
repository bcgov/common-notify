import type { FC } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'

export type EventTab = 'settings' | 'email' | 'sms' | 'third-party'

const TABS: { id: EventTab; label: string }[] = [
  { id: 'settings', label: 'Event Settings' },
  { id: 'email', label: 'Email Notification' },
  { id: 'sms', label: 'SMS Notification' },
  { id: 'third-party', label: 'Third-party Notification' },
]

type EventTabsProps = {
  selected: EventTab
  /**
   * Omitted where the other tabs cannot be opened, e.g. the create page before the event has
   * an id to attach settings to.
   */
  onSelect?: (tab: EventTab) => void
  /** Tabs that exist but cannot be opened yet. */
  disabledTabs?: EventTab[]
}

/**
 * The event pages' tab bar. Shared so the create, edit and saved pages offer the same tabs in
 * the same order - they were three copies, and had already drifted apart.
 */
const EventTabs: FC<EventTabsProps> = ({ selected, onSelect, disabledTabs = [] }) => (
  <div className="events__tabs">
    <ToggleButtonGroup
      size="medium"
      orientation="horizontal"
      selectionMode="single"
      selectedKeys={[selected]}
      onSelectionChange={(keys) => {
        const [key] = [...keys]
        if (key && key !== selected) {
          onSelect?.(key as EventTab)
        }
      }}
      disallowEmptySelection
    >
      {TABS.map(({ id, label }) => (
        <ToggleButton key={id} id={id} size="medium" isDisabled={disabledTabs.includes(id)}>
          {label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  </div>
)

export default EventTabs
