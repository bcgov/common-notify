import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import PageSubHeading from '../../../components/PageSubHeading'
import { useCstarRoles } from '@/hooks/useCstarRoles'

// Mocked notification events data for now
const mockNotificationEvents = [
  { id: '1', name: 'New Order Ready' },
  { id: '2', name: 'Extra Cheese Requested' },
]

/**
 * Used on the Dashboard page
 */
export const NotificationEventsSection: FC = () => {
  const { canEdit } = useCstarRoles()

  return (
    <section className="mb-4">
      <PageSubHeading title="Notification Events"></PageSubHeading>
      <Button variant="primary" isDisabled={!canEdit}>
        Create New Notification Event
      </Button>
      <ul className="list-unstyled mt-3 d-flex flex-column gap-2">
        {mockNotificationEvents.slice(0, 2).map((event) => (
          <li key={event.id}>
            <Link to="/notification-events" style={{ color: 'black' }}>
              {event.name}
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/notification-events" style={{ color: '#255A90' }}>
        Browse other events
      </Link>
    </section>
  )
}
