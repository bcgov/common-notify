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
  { label: 'Dashboard', to: '/dashboard', icon: <HomeOutlinedIcon /> },
  {
    label: 'Notification Events',
    to: '/notification-events',
    icon: <WorkspacesOutlinedIcon />,
  },
  { label: 'Templates', to: '/templates', icon: <DescriptionOutlinedIcon /> },
  {
    label: 'Distribution Lists',
    to: '/distribution-lists',
    icon: <GroupOutlinedIcon />,
  },
  { label: 'Settings', to: '/settings', icon: <SettingsOutlinedIcon /> },
]

const Sidebar: FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  // Get user from Redux store (populated from JWT token)
  const user = useAppSelector((state) => state.auth.user)

  const handleLogout = () => {
    UserService.doLogout()
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Toggle */}
      <div className="sidebar__toggle" onClick={() => setCollapsed(!collapsed)}>
        <span className="sidebar__icon">
          {collapsed ? (
            <KeyboardDoubleArrowRightOutlinedIcon />
          ) : (
            <KeyboardDoubleArrowLeftOutlinedIcon />
          )}
        </span>
      </div>

      {/* Top nav */}
      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="sidebar__item"
            activeProps={{ className: 'active' }}
            title={collapsed ? item.label : ''}
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span className="sidebar__label">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="sidebar__bottom">
        {/* Help */}
        <div className="sidebar__item" title={collapsed ? 'Help' : ''}>
          <span className="sidebar__icon">
            <HelpOutlinedIcon />
          </span>
          <span className="sidebar__label">Help</span>
        </div>

        {/* User */}
        {user && (
          <div className="sidebar__item sidebar__user" title={collapsed ? user.displayName : ''}>
            <span className="sidebar__icon">
              <PersonOutlinedIcon />
            </span>
            <span className="sidebar__label">{user.displayName}</span>
          </div>
        )}

        {/* Logout */}
        <div className="sidebar__item" onClick={handleLogout} title={collapsed ? 'Logout' : ''}>
          <span className="sidebar__icon">
            <LogoutOutlinedIcon />
          </span>
          <span className="sidebar__label">Logout</span>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
