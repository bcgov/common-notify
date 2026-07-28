import { useId, useRef, useState, type FC } from 'react'
import { Overlay, Popover } from 'react-bootstrap'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

/** Flatten a request's recipients (email, then SMS, then MsgApp) into one ordered list. */
const recipientList = (recipients?: NotificationRequest['recipients']): string[] => [
  ...(recipients?.email ?? []),
  ...(recipients?.sms ?? []),
  ...(recipients?.msgApp ?? []),
]

/**
 * Notification Status table recipients cell
 * fixed width, hovering brings up a popover with up to 5 recipients listed
 * view all dialogue brings up the old modal for now
 */
export const RecipientsCell: FC<{
  recipients?: NotificationRequest['recipients']
  onViewAll: () => void
}> = ({ recipients, onViewAll }) => {
  const all = recipientList(recipients)
  const popoverId = useId()
  const [show, setShow] = useState(false)
  const targetRef = useRef<HTMLSpanElement>(null)

  if (all.length === 0) {
    return <span className="text-muted">No recipients</span>
  }

  const visible = all.slice(0, 5)
  const hasMore = all.length > 5

  return (
    <>
      <span
        ref={targetRef}
        className="data-table__truncate"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {all.join(', ')}
      </span>

      <Overlay
        target={() => targetRef.current}
        show={show}
        placement="bottom-start"
        container={document.body}
        flip
        popperConfig={{
          // reduce the gap between the popover and the text
          modifiers: [{ name: 'offset', options: { offset: [0, -2] } }],
        }}
      >
        {(props) => (
          <Popover
            {...props}
            id={popoverId}
            className="recipients-popover"
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
          >
            <Popover.Header className="recipients-popover__title">
              Recipients ({all.length})
            </Popover.Header>
            <Popover.Body className="recipients-popover__body">
              <ul className="recipients-popover__list">
                {visible.map((recipient, i) => (
                  <li key={i} className="recipients-popover__item">
                    {recipient}
                  </li>
                ))}
              </ul>
              {hasMore && (
                <button
                  type="button"
                  className="recipients-popover__view-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShow(false)
                    onViewAll()
                  }}
                >
                  View all
                </button>
              )}
            </Popover.Body>
          </Popover>
        )}
      </Overlay>
    </>
  )
}

export default RecipientsCell
