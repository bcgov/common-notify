import { Link } from '@tanstack/react-router'
import type { FC } from 'react'

interface NotificationEvent {
  id: number
  name: string
}

const mockNotificationEvents: NotificationEvent[] = [
  { id: 1, name: 'Graduates Outcome Survey' },
  { id: 2, name: 'Employer Followup Survey' },
  { id: 3, name: 'Internal Team Alert' },
]

/**
 * NotificationEventsList Component
 * Displays a list of available notification events that can trigger notifications
 */
const NotificationEventsList: FC = () => {
  return (
    <div>
      <h2 className="h4 fw-bold mb-3">Notification Events</h2>
      <ul className="list-unstyled d-flex flex-column gap-2">
        {mockNotificationEvents.map((event) => (
          <li key={event.id}>
            <Link to="/notification-events" className="text-secondary">
              {event.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default NotificationEventsList
