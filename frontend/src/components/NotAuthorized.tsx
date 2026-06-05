import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'

interface NotAuthorizedProps {
  cstarUrl?: string
}

const NotAuthorized: FC<NotAuthorizedProps> = ({ cstarUrl }) => {
  const handleCstarClick = () => {
    if (cstarUrl) {
      window.location.href = cstarUrl
    }
  }

  return (
    <div className="d-flex flex-column justify-content-center align-items-center min-vh-100">
      <h1>403</h1>
      <h2>Not Authorized</h2>
      <p>You don&apos;t have the required permissions to access BC Notify.</p>
      <p>Please contact your administrator to request access.</p>
      {cstarUrl && (
        <>
          <p className="mt-3">You can manage your service access in CSTAR</p>
          <Button id="cstarBtn" onClick={handleCstarClick}>
            Open CSTAR
          </Button>
        </>
      )}
    </div>
  )
}

export default NotAuthorized
