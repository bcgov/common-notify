import type { ReactNode } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'
import '@/scss/components/tab-bar.scss'

export interface TabBarItem<T extends string> {
  id: T
  label: ReactNode
}

interface TabBarProps<T extends string> {
  items: TabBarItem<T>[]
  selected: T
  onSelect: (id: T) => void
  /** Names the group for screen readers, e.g. "Monitoring views". */
  label: string
}

/**
 * A row of mutually exclusive view switches, drawn with the design system's ToggleButtonGroup
 * so it matches the event pages' tabs. The group handles arrow-key movement between options.
 */
export function TabBar<T extends string>({
  items,
  selected,
  onSelect,
  label,
}: Readonly<TabBarProps<T>>) {
  return (
    <div className="tab-bar">
      <ToggleButtonGroup
        aria-label={label}
        size="medium"
        orientation="horizontal"
        selectionMode="single"
        selectedKeys={[selected]}
        onSelectionChange={(keys) => {
          const [key] = [...keys]
          if (key && key !== selected) onSelect(key as T)
        }}
        disallowEmptySelection
      >
        {items.map(({ id, label: itemLabel }) => (
          <ToggleButton key={id} id={id} size="medium">
            {itemLabel}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  )
}

export default TabBar
