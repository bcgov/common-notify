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
 * A labelled set of sub-links inside an expandable sidebar item. The heading is a label, not a
 * link, so screen readers announce it as the group's name ("Monitor, group") on entering it.
 */
const SidebarNavGroup: FC<SidebarNavGroupProps> = ({ label, links }) => {
  const labelId = useId()

  return (
    <div className="sidebar__group" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="sidebar__group-label">
        {label}
      </span>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="sidebar__subitem"
          activeProps={{ className: 'active' }}
        >
          <span className="sidebar__label">{link.label}</span>
        </Link>
      ))}
    </div>
  )
}

export default SidebarNavGroup
