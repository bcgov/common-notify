import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { StatusBadge } from '@/components/StatusBadge'
import '@/scss/components/component-status-list.scss'

export interface ComponentStatus {
  name: string
  /** The value StatusBadge colours by, e.g. 'healthy' or 'critical'. */
  status: string
  statusLabel: string
  /** The page with this component's details. */
  to: NonNullable<LinkProps['to']>
}

interface ComponentStatusListProps {
  label: string
  components: ComponentStatus[]
}

/** One row per component: its name, linking to its details, and its status in words. */
const ComponentStatusList: FC<ComponentStatusListProps> = ({ label, components }) => (
  <ul className="component-status-list" aria-label={label}>
    {components.map((component) => (
      <li key={component.name} className="component-status-list__item">
        <Link to={component.to} className="component-status-list__name">
          {component.name}
        </Link>
        <StatusBadge status={component.status} statusLabel={component.statusLabel} />
      </li>
    ))}
  </ul>
)

export default ComponentStatusList
