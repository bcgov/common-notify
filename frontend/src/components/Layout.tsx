import type { FC } from 'react'
import { ToastContainer } from 'react-toastify'
import { Footer, Header } from '@bcgov/design-system-react-components'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { fetchCstarTenants, fetchCstarRoles } from '@/redux/thunks/cstar.thunks'
import LoadingSpinner from './LoadingSpinner'
import TenantError from './TenantError'
import TenantSelectionModal from './TenantSelectionModal'
import TenantSwitcher from './TenantSwitcher'
import { APP_VERSION } from '@/utils/version'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'
import Sidebar from './Sidebar'

type Props = {
  children: React.ReactNode
}

const Layout: FC<Props> = ({ children }) => {
  const dispatch = useAppDispatch()
  const location = useLocation()
  const navigate = useNavigate()

  const tenants = useAppSelector((state) => state.cstar.tenants)
  const tenantError = useAppSelector((state) => state.cstar.error)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const showTenantModal = useAppSelector((state) => state.tenant.showTenantModal)
  const rolesLoading = useAppSelector((state) => state.user.rolesLoading)
  const rolesTenantId = useAppSelector((state) => state.user.rolesTenantId)
  const rolesError = useAppSelector((state) => state.user.rolesError)
  const cstarRoles = useAppSelector((state) => state.user.current?.cstarRoles)
  const userCurrent = useAppSelector((state) => state.user.current)
  const { canEdit } = useCstarRoles()

  // Tenant whose roles request is currently in flight, so the effect below doesn't
  // dispatch twice before the pending state lands in this component's props.
  const rolesRequestRef = useRef<string | null>(null)

  // When tenant selection changes, fetch roles for that tenant
  useEffect(() => {
    if (!selectedTenant?.id) {
      return
    }

    // Wait until the user record has been upserted so roles can be stored
    if (!userCurrent) {
      return
    }

    // Already have (or are fetching) roles for this tenant
    if (rolesTenantId === selectedTenant.id || rolesRequestRef.current === selectedTenant.id) {
      return
    }

    rolesRequestRef.current = selectedTenant.id
    dispatch(fetchCstarRoles({ tenantId: selectedTenant.id }))
  }, [selectedTenant?.id, userCurrent, rolesTenantId, dispatch])

  useEffect(() => {
    // Enforce tenant-level authorization after roles fetch completes.
    // If user has no roles in selected tenant (or roles lookup fails), show not-authorized.
    if (!selectedTenant?.id) {
      return
    }

    // Only judge access once the lookup for *this* tenant has settled. Gating on
    // "a fetch was dispatched" instead would run this check against the previous
    // tenant's roles (or none at all) while the request is still in flight.
    if (rolesLoading || rolesTenantId !== selectedTenant.id) {
      return
    }

    if (location.pathname === '/not-authorized') {
      return
    }

    const hasNoRoles = Array.isArray(cstarRoles) && cstarRoles.length === 0
    if (rolesError || hasNoRoles) {
      navigate({ to: '/not-authorized' })
      return
    }

    // Viewers may open a template in read-only mode (/template-edit/:id), but
    // only editors/admins may create one (/template-create).
    const isTemplateCreateRoute = location.pathname === '/template-create'
    if (isTemplateCreateRoute && !canEdit) {
      navigate({ to: '/templates' })
      return
    }

    // Feature Flags is open to NOTIFY_OPERATIONS_ADMIN as well as NOTIFY_ADMIN.
    if (
      location.pathname === '/admin/feature-flags' &&
      !UserService.hasRole(SsoRole.NOTIFY_ADMIN)
    ) {
      navigate({ to: '/not-authorized' })
    }
  }, [
    selectedTenant?.id,
    rolesLoading,
    rolesTenantId,
    rolesError,
    cstarRoles,
    canEdit,
    location.pathname,
    navigate,
  ])

  // Block rendering until roles for the selected tenant have settled, so pages never
  // render against another tenant's roles. A failed lookup also sets `rolesTenantId`,
  // so this can't spin forever — the effect above sends those users to /not-authorized.
  if (selectedTenant && userCurrent && rolesTenantId !== selectedTenant.id) {
    return <LoadingSpinner isVisible />
  }

  // Only block on CSTAR error if we don't have a selected tenant
  // Once tenant is selected in Redux, we don't need CSTAR anymore
  if (tenantError && !selectedTenant) {
    return <TenantError error={tenantError} onRetry={() => dispatch(fetchCstarTenants())} />
  }

  if (!selectedTenant && !showTenantModal && tenants.length > 0) {
    return <LoadingSpinner isVisible />
  }

  const showSidebar = location.pathname !== '/not-authorized'

  return (
    <>
      <LoadingSpinner />
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <TenantSelectionModal />
      <div className="layout-container">
        <div className="layout-header">
          <Header title={'BC Notify'}>
            <div className="layout-header-nav">
              <div className="layout-header-user">
                <TenantSwitcher />
              </div>
            </div>
          </Header>
        </div>
        <div className="layout-body">
          <div className="layout-body-inner">
            {showSidebar && <Sidebar />}
            <div className="layout-content">{children}</div>
          </div>
        </div>
        <div className="layout-footer">
          <Footer />
          <div className="footer-version">v{APP_VERSION}</div>
        </div>
      </div>
    </>
  )
}

export default Layout
