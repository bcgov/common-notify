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
  const rolesError = useAppSelector((state) => state.user.rolesError)
  const cstarRoles = useAppSelector((state) => state.user.current?.cstarRoles)

  // Track which tenants we've already fetched roles for in this session
  const rolesFetchedRef = useRef<Set<string>>(new Set())

  // When tenant selection changes, fetch roles for that tenant (once per session)
  useEffect(() => {
    if (!selectedTenant?.id) {
      return
    }

    // Only fetch if we haven't already fetched roles for this tenant in this session
    if (rolesFetchedRef.current.has(selectedTenant.id)) {
      return
    }

    rolesFetchedRef.current.add(selectedTenant.id)
    dispatch(fetchCstarRoles({ tenantId: selectedTenant.id }))
  }, [selectedTenant?.id, dispatch])

  useEffect(() => {
    // Enforce tenant-level authorization after roles fetch completes.
    // If user has no roles in selected tenant (or roles lookup fails), show not-authorized.
    if (!selectedTenant?.id) {
      return
    }

    if (!rolesFetchedRef.current.has(selectedTenant.id) || rolesLoading) {
      return
    }

    if (location.pathname === '/not-authorized') {
      return
    }

    const hasNoRoles = Array.isArray(cstarRoles) && cstarRoles.length === 0
    if (rolesError || hasNoRoles) {
      navigate({ to: '/not-authorized' })
    }
  }, [selectedTenant?.id, rolesLoading, rolesError, cstarRoles, location.pathname, navigate])

  // Block rendering while we're fetching roles for the selected tenant
  // This ensures authorization checks have the correct roles loaded
  if (selectedTenant && rolesLoading) {
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
          <Header title={'Notify'}>
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
