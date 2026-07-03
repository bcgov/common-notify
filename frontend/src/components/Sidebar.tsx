// Sidebar.tsx
import { useState } from 'react'
import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import '@/scss/components/sidebar.scss'
import { useAppSelector } from '@/redux/hooks'
import UserService from '@/service/user-service'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { SsoRole } from '@/enum/sso-role.enum'

// Icons
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined'
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined'
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined'
import { CstarRole } from '@/enum/cstar-role.enum'

const navItems = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: <HomeOutlinedIcon />,
  },
  {
    label: 'Templates',
    to: '/templates',
    icon: <FolderOutlinedIcon />,
  },
  {
    label: 'Usage & Limits',
    to: '/usage',
    icon: <SpeedOutlinedIcon />,
  },
]

const adminItems = {
  label: 'Admin',
  icon: <AdminPanelSettingsOutlinedIcon />,
  subItems: [
    {
      label: 'Feature Flags',
      to: '/admin/feature-flags',
    },
    {
      label: 'Usage & Limits',
      to: '/admin/usage',
    },
  ],
} as const

const Sidebar: FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [adminExpanded, setAdminExpanded] = useState(false)
  // Get user from Redux store (populated from JWT token)
  const user = useAppSelector((state) => state.auth.user)
  const cstarTenants = useAppSelector((state) => state.cstar.tenants)
  const { hasRole, hasTenantRole } = useCstarRoles()
  const isAdmin = UserService.hasRole(SsoRole.NOTIFY_ADMIN)
  const isOperationsAdmin = hasRole(CstarRole.NOTIFY_OPERATIONS_ADMIN)

  // Determine which menu items to show based on roles
  // Dashboard and Templates require CSTAR roles (assume NOTIFY_VIEWER or similar)
  const showDashboard = cstarTenants.length > 0
  const showTemplates = cstarTenants.length > 0
  const showUsage = cstarTenants.length > 0
  // Feature Flags requires NOTIFY_ADMIN (SSO)
  const showAdminFeatureFlags = isAdmin

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
        {collapsed ? (
          <ChevronRightIcon style={{ fontSize: 20 }} aria-hidden="true" />
        ) : (
          <ChevronLeftIcon style={{ fontSize: 20 }} aria-hidden="true" />
        )}
      </button>

      {/* Top nav */}
      <nav className="sidebar__nav" aria-label="Primary">
        {navItems.map((item) => {
          const shouldShow =
            (item.label === 'Dashboard' && hasTenantRole) ||
            (item.label === 'Templates' && hasTenantRole) ||
            (item.label === 'Usage & Limits' && showUsage) ||
            (item.label === 'Settings' && isOperationsAdmin)

          return shouldShow ? (
            <Link
              key={item.to}
              to={item.to}
              className="sidebar__item"
              activeProps={{ className: 'active' }}
              title={collapsed ? item.label : ''}
            >
              <span className="sidebar__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="sidebar__label">{item.label}</span>
            </Link>
          ) : null
        })}
        {isAdmin && (
          <div className="sidebar__menu-group">
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className={`sidebar__item sidebar__menu-toggle ${adminExpanded ? 'expanded' : ''}`}
              title={collapsed ? adminItems.label : ''}
            >
              <span className="sidebar__icon" aria-hidden="true">
                {adminItems.icon}
              </span>
              <span className="sidebar__label">{adminItems.label}</span>
              <span className="sidebar__menu-arrow" aria-hidden="true">
                <ExpandMoreOutlinedIcon style={{ fontSize: 18 }} />
              </span>
            </button>
            {adminExpanded && !collapsed && (
              <div className="sidebar__submenu">
                {isAdmin && (
                  <Link
                    to="/admin/feature-flags"
                    className="sidebar__subitem"
                    activeProps={{ className: 'active' }}
                  >
                    <span className="sidebar__label">Feature Flags</span>
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    to="/admin/usage"
                    className="sidebar__subitem"
                    activeProps={{ className: 'active' }}
                  >
                    <span className="sidebar__label">Usage &amp; Limits</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="sidebar__footer">
        {/* Help */}
        {/* TODO add a link to Help page when it is created */}
        <button type="button" className="sidebar__item" title={collapsed ? 'Help' : ''}>
          <span className="sidebar__icon" aria-hidden="true">
            <HelpOutlineOutlinedIcon />
          </span>
          <span className="sidebar__label">Help</span>
        </button>

        {/* Bottom section */}
        <div className="sidebar__bottom">
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
          <button
            type="button"
            className="sidebar__item"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : ''}
          >
            <span className="sidebar__icon" aria-hidden="true">
              <LogoutOutlinedIcon />
            </span>
            <span className="sidebar__label">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
