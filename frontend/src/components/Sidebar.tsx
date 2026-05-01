// Sidebar.tsx
import { FC, useState } from 'react'
import { Link } from '@tanstack/react-router'
import '../scss/components/Sidebar.scss'
import { useAppSelector } from '@/redux/hooks'
import UserService from '@/service/user-service'

// Icons
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import WorkspacesOutlinedIcon from '@mui/icons-material/WorkspacesOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined'
import KeyboardDoubleArrowLeftOutlinedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftOutlined'
import KeyboardDoubleArrowRightOutlinedIcon from '@mui/icons-material/KeyboardDoubleArrowRightOutlined'

const navItems = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: <HomeOutlinedIcon />,
    ariaLabel: 'Navigate to Dashboard',
  },
  {
    label: 'Notification Events',
    to: '/notification-events',
    icon: <WorkspacesOutlinedIcon />,
    ariaLabel: 'Navigate to Notification Events',
  },
  {
    label: 'Templates',
    to: '/templates',
    icon: <DescriptionOutlinedIcon />,
    ariaLabel: 'Navigate to Templates',
  },
  {
    label: 'Distribution Lists',
    to: '/distribution-lists',
    icon: <GroupOutlinedIcon />,
    ariaLabel: 'Navigate to Distribution Lists',
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: <SettingsOutlinedIcon />,
    ariaLabel: 'Navigate to Settings',
  },
]

const Sidebar: FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  // Get user from Redux store (populated from JWT token)
  const user = useAppSelector((state) => state.auth.user)

  const handleLogout = () => {
    UserService.doLogout()
  }

  return (
    <aside
      className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}
      aria-label="Main navigation"
    >
      {/* Toggle */}
      <button
        className="sidebar__toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="sidebar__icon" aria-hidden="true">
          {collapsed ? (
            <KeyboardDoubleArrowRightOutlinedIcon />
          ) : (
            <KeyboardDoubleArrowLeftOutlinedIcon />
          )}
        </span>
      </button>

      {/* Top nav */}
      <nav className="sidebar__nav" aria-label="Primary">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="sidebar__item"
            activeProps={{ className: 'active' }}
            aria-label={item.ariaLabel}
            title={collapsed ? item.label : ''}
          >
            <span className="sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="sidebar__label">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="sidebar__bottom">
        {/* Help */}
        <div className="sidebar__item" title={collapsed ? 'Help' : ''} aria-label="Help">
          <span className="sidebar__icon" aria-hidden="true">
            <HelpOutlinedIcon />
          </span>
          <span className="sidebar__label">Help</span>
        </div>

        {/* User */}
        {user && (
          <div
            className="sidebar__item sidebar__user"
            title={collapsed ? user.displayName : ''}
            aria-label={`Signed in as ${user.displayName}`}
          >
            <span className="sidebar__icon" aria-hidden="true">
              <PersonOutlinedIcon />
            </span>
            <span className="sidebar__label">{user.displayName}</span>
          </div>
        )}

        {/* Logout */}
        <div
          className="sidebar__item"
          onClick={handleLogout}
          title={collapsed ? 'Logout' : ''}
          aria-label="Logout"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleLogout()}
        >
          <span className="sidebar__icon" aria-hidden="true">
            <LogoutOutlinedIcon />
          </span>
          <span className="sidebar__label">Logout</span>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
