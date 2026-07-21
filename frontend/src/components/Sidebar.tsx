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
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined'
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined'
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined'
import { CstarRole, CSTAR_ROLE_DISPLAY } from '@/enum/cstar-role.enum'
import { Button, Tooltip, TooltipTrigger, SvgInfoIcon } from '@bcgov/design-system-react-components'

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
    {
      label: 'Tenant Settings',
      to: '/admin/settings',
    },
  ],
} as const

const Sidebar: FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [adminExpanded, setAdminExpanded] = useState(false)
  // Get user from Redux store (populated from JWT token)
  const user = useAppSelector((state) => state.auth.user)
  const cstarTenants = useAppSelector((state) => state.cstar.tenants)
  const { primaryRole, hasRole, hasTenantRole } = useCstarRoles()
  const isAdmin = UserService.hasRole(SsoRole.NOTIFY_ADMIN)

  // Determine which menu items to show based on roles
  // Dashboard and Templates require CSTAR roles (assume NOTIFY_VIEWER or similar)
  const showUsage = cstarTenants.length > 0

  const handleLogout = () => {
    UserService.doLogout()
  }

  const handleLogin = () => {
    UserService.doLogin()
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
            (item.label === 'Usage & Limits' && showUsage)

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
            <Button
              variant="link"
              className="sidebar__item"
              aria-label={collapsed ? adminItems.label : undefined}
              aria-expanded={!collapsed && adminExpanded}
              onPress={() => {
                if (collapsed) {
                  setCollapsed(false)
                  setAdminExpanded(true)
                } else {
                  setAdminExpanded(!adminExpanded)
                }
              }}
            >
              <span className="sidebar__icon" aria-hidden="true">
                {adminItems.icon}
              </span>
              <span className="sidebar__label">{adminItems.label}</span>
              {!collapsed && (
                <span
                  className={`sidebar__menu-arrow ${adminExpanded ? 'expanded' : ''}`}
                  aria-hidden="true"
                >
                  <ExpandMoreOutlinedIcon style={{ fontSize: 18 }} />
                </span>
              )}
            </Button>
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
                {isAdmin && (
                  <Link
                    to="/admin/settings"
                    className="sidebar__subitem"
                    activeProps={{ className: 'active' }}
                  >
                    <span className="sidebar__label">Tenant Settings</span>
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
        <Button variant="link" className="sidebar__item">
          <span className="sidebar__icon" aria-hidden="true">
            <HelpOutlineOutlinedIcon />
          </span>
          <span className="sidebar__label">Help</span>
        </Button>

        {/* Bottom section */}
        <div className="sidebar__bottom">
          {/* User */}
          {user && (
            <>
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
              {primaryRole && !collapsed && (
                <div
                  className="sidebar__role"
                  aria-label={`User role ${CSTAR_ROLE_DISPLAY[primaryRole].label}`}
                >
                  <span className="sidebar__role-heading">Role</span>
                  <span className="sidebar__role-value">
                    <span className="sidebar__label">{CSTAR_ROLE_DISPLAY[primaryRole].label}</span>
                    <TooltipTrigger>
                      <Button
                        aria-label={`About the ${CSTAR_ROLE_DISPLAY[primaryRole].label} role`}
                        className="sidebar__role-tooltip-trigger"
                        isIconButton
                        size="xsmall"
                        type="button"
                        variant="tertiary"
                      >
                        <SvgInfoIcon />
                      </Button>
                      <Tooltip placement="right">
                        {CSTAR_ROLE_DISPLAY[primaryRole].description}
                      </Tooltip>
                    </TooltipTrigger>
                  </span>
                </div>
              )}
            </>
          )}

          {/* Logout / Login */}
          {user ? (
            <Button
              variant="link"
              className="sidebar__item"
              onPress={handleLogout}
              aria-label={collapsed ? 'Logout' : undefined}
            >
              <span className="sidebar__icon" aria-hidden="true">
                <LogoutOutlinedIcon />
              </span>
              <span className="sidebar__label">Logout</span>
            </Button>
          ) : (
            <Button variant="link" className="sidebar__item" onPress={handleLogin}>
              <span className="sidebar__icon" aria-hidden="true">
                <LoginOutlinedIcon />
              </span>
              <span className="sidebar__label">Login</span>
            </Button>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
