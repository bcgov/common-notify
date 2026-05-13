import { Modal, Button } from 'react-bootstrap'
import type { FC } from 'react'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

/**
 * Helper to get total recipient count
 */
export function getTotalRecipientCount(recipients?: {
  email?: string[]
  sms?: string[]
  msgApp?: string[]
}): number {
  if (!recipients) return 0
  return (
    (recipients.email?.length || 0) +
    (recipients.sms?.length || 0) +
    (recipients.msgApp?.length || 0)
  )
}

/**
 * Modal component to display recipients
 */
export const RecipientsModal: FC<{
  show: boolean
  notification: NotificationRequest | null
  onHide: () => void
}> = ({ show, notification, onHide }) => {
  const recipients = notification?.recipients || { email: [], sms: [], msgApp: [] }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Notification Recipients</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {recipients.email && recipients.email.length > 0 && (
          <div className="mb-3">
            <h6>Email Recipients ({recipients.email.length})</h6>
            <ul className="list-unstyled">
              {recipients.email.map((email, idx) => (
                <li key={`email-${idx}`} style={{ wordBreak: 'break-all' }}>
                  {email}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recipients.sms && recipients.sms.length > 0 && (
          <div className="mb-3">
            <h6>SMS Recipients ({recipients.sms.length})</h6>
            <ul className="list-unstyled">
              {recipients.sms.map((phone, idx) => (
                <li key={`sms-${idx}`} style={{ wordBreak: 'break-all' }}>
                  {phone}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recipients.msgApp && recipients.msgApp.length > 0 && (
          <div className="mb-3">
            <h6>MsgApp Recipients ({recipients.msgApp.length})</h6>
            <ul className="list-unstyled">
              {recipients.msgApp.map((user, idx) => (
                <li key={`msgapp-${idx}`} style={{ wordBreak: 'break-all' }}>
                  {user}
                </li>
              ))}
            </ul>
          </div>
        )}

        {getTotalRecipientCount(recipients) === 0 && (
          <p className="text-muted">No recipients found</p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default RecipientsModal
