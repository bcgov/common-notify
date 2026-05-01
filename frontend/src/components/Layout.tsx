import type { FC } from 'react'
import { ToastContainer } from 'react-toastify'
import { Footer, Header } from '@bcgov/design-system-react-components'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import UserService from '@/service/user-service'
import { fetchTenants } from '@/redux/thunks/auth.thunks'
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

  // Get user and tenant state from Redux store
  const user = useAppSelector((state) => state.auth.user)
  const selectedTenant = useAppSelector((state) => state.auth.selectedTenant)
  const tenantLoading = useAppSelector((state) => state.auth.tenantLoading)
  const tenantError = useAppSelector((state) => state.auth.tenantError)
  const showTenantModal = useAppSelector((state) => state.auth.showTenantModal)

  // Block rendering: show error if tenant fetch failed
  if (user && tenantError) {
    return <TenantError error={tenantError} onRetry={() => dispatch(fetchTenants())} />
  }

  // Block rendering: show spinner while loading
  if (!user || tenantLoading) {
    return <LoadingSpinner />
  }

  // Block rendering: show spinner if no tenant selected and modal not shown (should not happen normally)
  if (!selectedTenant && !showTenantModal) {
    return <LoadingSpinner />
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
                {user && selectedTenant && (
                  <span className="username">
                    {user.displayName}
                  </span>
                )}
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
