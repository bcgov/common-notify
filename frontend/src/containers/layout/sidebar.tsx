import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import UserService from '@/service/user-service'

const navItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Workspaces', to: '/workspaces' },
  { label: 'Templates', to: '/templates' },
  { label: 'Distribution Lists', to: '/distribution-lists' },
  { label: 'Settings', to: '/settings' },
] as const

export const SideBar: FC = () => {
  const username = UserService.getUsername() ?? 'User'

  return (
    <aside
      className="d-flex flex-column border-end bg-white"
      style={{ width: '300px', padding: '1.25rem 1rem', flexShrink: 0 }}
    >
      <div className="d-flex align-items-center gap-2 mb-4">
        <div
          className="rounded-circle border d-flex align-items-center justify-content-center bg-light"
          style={{ width: '40px', height: '40px', flexShrink: 0 }}
        >
          <i className="bi bi-person fs-5" />
        </div>
        <span className="text-truncate small fw-medium">{username}</span>
      </div>
      <nav className="d-flex flex-column gap-1">
        {navItems.map(({ label, to }) => (
          <Link
            key={to}
            to={to}
            className="nav-link text-dark px-0 py-1"
            activeProps={{ className: 'fw-bold' }}
            activeOptions={{ exact: to === '/' }}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
