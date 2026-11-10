import { useId } from 'react'
import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'

export interface SidebarNavLink {
  label: string
  to: NonNullable<LinkProps['to']>
}

export interface SidebarNavGroupProps {
  /** Shown above the links and used as the group's accessible name. */
  label: string
  links: readonly SidebarNavLink[]
}

/**
 * A labelled list of sub-links inside an expandable sidebar item. The heading is text, not a
 * link; it names the list, so screen readers announce "Monitor, list, 3 items" on entering it.
 */
const SidebarNavGroup: FC<SidebarNavGroupProps> = ({ label, links }) => {
  const labelId = useId()

  return (
    <div className="sidebar__group">
      <span id={labelId} className="sidebar__group-label">
        {label}
      </span>
      <ul className="sidebar__group-list" aria-labelledby={labelId}>
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="sidebar__subitem" activeProps={{ className: 'active' }}>
              <span className="sidebar__label">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SidebarNavGroup
