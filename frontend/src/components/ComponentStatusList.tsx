import { useId } from 'react'
import type { FC } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import '@/scss/components/component-status-list.scss'

export interface ComponentStatus {
  name: string
  /** The value StatusBadge colours by, e.g. 'healthy' or 'critical'. */
  status: string
  statusLabel: string
}

export interface ComponentStatusGroup {
  label: string
  components: ComponentStatus[]
}

interface ComponentStatusListProps {
  groups: ComponentStatusGroup[]
}

const Group: FC<ComponentStatusGroup> = ({ label, components }) => {
  const labelId = useId()
  return (
    <div className="component-status__group">
      <h3 id={labelId} className="component-status__group-label">
        {label}
      </h3>
      <ul className="component-status__list" aria-labelledby={labelId}>
        {components.map((component) => (
          <li key={component.name} className="component-status__item">
            <span>{component.name}</span>
            <StatusBadge status={component.status} statusLabel={component.statusLabel} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Components side by side in labelled columns, each with its status in words. */
const ComponentStatusList: FC<ComponentStatusListProps> = ({ groups }) => (
  <div className="component-status">
    {groups.map((group) => (
      <Group key={group.label} label={group.label} components={group.components} />
    ))}
  </div>
)

export default ComponentStatusList
