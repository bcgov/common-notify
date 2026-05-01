import type { FC } from 'react'
import { ToastContainer } from 'react-toastify'
import { Footer, Header } from '@bcgov/design-system-react-components'
import LoadingSpinner from './LoadingSpinner'
import { APP_VERSION } from '@/utils/version'
import Sidebar from './Sidebar'

type Props = {
  children: React.ReactNode
}

const Layout: FC<Props> = ({ children }) => {
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
            <div className="layout-header-nav"></div>
          </Header>
        </div>
        <div className="layout-body">
          <div className="layout-body-inner">
            <Sidebar />
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
