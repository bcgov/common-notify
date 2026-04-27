import type { FC } from 'react'
import { Nav } from 'react-bootstrap'
import { Link } from '@tanstack/react-router'

const navItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Workspaces', to: '/workspaces' },
  { label: 'Templates', to: '/templates' },
  { label: 'Distribution Lists', to: '/distribution-lists' },
  { label: 'Settings', to: '/settings' },
] as const

export const SideBar: FC = () => {
  return (
    <aside className="layout-sidebar">
      <Nav className="flex-column gap-1">
        {navItems.map(({ label, to }) => (
          <Link
            key={to}
            to={to}
            className="nav-link text-dark px-0 py-1"
            activeProps={{ className: 'nav-link text-dark px-0 py-1 fw-bold' }}
            activeOptions={{ exact: to === '/dashboard' }}
          >
            {label}
          </Link>
        ))}
      </Nav>
    </aside>
  )
}
