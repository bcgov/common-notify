import type { FC } from 'react'
import { ToastContainer } from 'react-toastify'
import { Footer, Header } from '@bcgov/design-system-react-components'
import { useAppSelector } from '@/redux/hooks'
import UserService from '@/service/user-service'
import LoadingSpinner from './LoadingSpinner'
import { APP_VERSION } from '@/utils/version'
import { SideBar } from './Sidebar'

type Props = {
  children: React.ReactNode
}

const Layout: FC<Props> = ({ children }) => {
  // Get user from Redux store (populated from JWT token)
  const user = useAppSelector((state) => state.auth.user)

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
      <div className="layout-container">
        <div className="layout-header">
          <Header title={'Notify'}>
            <div className="layout-header-nav">
              <div className="layout-header-user">
                {user && <span className="username">{user.displayName}</span>}
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
