import type { FC, ReactNode } from 'react'
import { Footer, Header } from '@bcgov/design-system-react-components'
import { SideBar } from './'

type Props = {
  children: ReactNode
}

{
  /** using the bcgov node package header/footer for now */
}
export const Layout: FC<Props> = ({ children }) => {
  return (
    <div className="d-flex flex-column min-vh-100">
      <Header title="Common Notify" />
      <div className="d-flex flex-grow-1">
        <SideBar />
        <main className="flex-grow-1 py-4 px-5">{children}</main>
      </div>
      <Footer />
    </div>
  )
}
