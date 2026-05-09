import type { FC } from 'react'
import { ToastContainer } from 'react-toastify'
import { Footer, Header } from '@bcgov/design-system-react-components'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import UserService from '@/service/user-service'
import { fetchCstarTenants } from '@/redux/thunks/cstar.thunks'
import LoadingSpinner from './LoadingSpinner'
import TenantError from './TenantError'
import TenantSelectionModal from './TenantSelectionModal'
import TenantSwitcher from './TenantSwitcher'
import { APP_VERSION } from '@/utils/version'
import { SideBar } from './Sidebar'

type Props = {
  children: React.ReactNode
}

const Layout: FC<Props> = ({ children }) => {
  const dispatch = useAppDispatch()

  const user = useAppSelector((state) => state.auth.user)
  const isInitializing = useAppSelector((state) => state.auth.isInitializing)
  const tenants = useAppSelector((state) => state.cstar.tenants)
  const tenantLoading = useAppSelector((state) => state.cstar.isLoading)
  const tenantError = useAppSelector((state) => state.cstar.error)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const showTenantModal = useAppSelector((state) => state.tenant.showTenantModal)

  if (isInitializing || !user || tenantLoading) {
    return <LoadingSpinner isVisible />
  }

  // Only block on CSTAR error if we don't have a selected tenant
  // Once tenant is selected in Redux, we don't need CSTAR anymore
  if (tenantError && !selectedTenant) {
    return <TenantError error={tenantError} onRetry={() => dispatch(fetchCstarTenants(user.id))} />
  }

  if (!selectedTenant && !showTenantModal && tenants.length > 0) {
    return <LoadingSpinner isVisible />
  }

  const handleLogout = () => {
    UserService.doLogout()
  }

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
                {user && selectedTenant && <span className="username">{user.displayName}</span>}
                <button className="logout-button" onClick={handleLogout} title="Logout">
                  <i className="bi bi-box-arrow-right" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </Header>
        </div>
        <div className="layout-body">
          <div className="layout-body-inner">
            <SideBar />
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
