import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'

interface NotAuthorizedProps {
  cstarUrl?: string
}

const NotAuthorized: FC<NotAuthorizedProps> = ({ cstarUrl }) => {
  const notifyRoles = ['NOTIFY_VIEWER', 'NOTIFY_TEMPLATE_EDITOR', 'NOTIFY_OPERATIONS_ADMIN']

  const handleCstarClick = () => {
    if (cstarUrl) {
      window.location.href = cstarUrl
    }
  }

  return (
    <div className="d-flex flex-column justify-content-center align-items-center min-vh-100">
      <h1>403</h1>
      <h2>Access to Tenant Not Available</h2>
      <p>You don&apos;t currently have access to Notify for this tenant.</p>
      <p>
        Access to Notify is managed through CSTAR. To proceed, you must be assigned to
        the selected tenant with one of the following roles:
      </p>
      <ul>
        {notifyRoles.map((role) => (
          <li key={role}>{role}</li>
        ))}
      </ul>
      <p>Please contact your administrator or appropriate access authority to request access.</p>
      {cstarUrl && (
        <>
          <Button id="cstarBtn" onClick={handleCstarClick}>
            Open CSTAR
          </Button>
        </>
      )}
    </div>
  )
}

export default NotAuthorized
