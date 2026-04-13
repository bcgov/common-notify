import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Footer, Header } from '@bcgov/design-system-react-components'
import { Link } from '@tanstack/react-router'
import UserService from '@/service/user-service'
import '@/scss/components/layout.scss'

type Props = {
  children: React.ReactNode
}

const Layout: FC<Props> = ({ children }) => {
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    setUsername(UserService.getUsername() || null)
  }, [])

  const handleLogout = () => {
    UserService.doLogout()
  }

  return (
    <div className="layout-container">
      <Header title={'Notify'} className="layout-header">
        <div className="layout-header-nav">
          <div className="layout-header-user">
            {username && <span className="username">{username}</span>}
            <button className="logout-button" onClick={handleLogout} title="Logout">
              <i className="bi bi-box-arrow-right" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </Header>
      <div className="layout-content">{children}</div>
      <Footer className="layout-footer" />
    </div>
  )
}

export default Layout
