import { Button, Form, Select, TextField } from '@bcgov/design-system-react-components'
import type { FC } from 'react'

const mockNotificationEvents = [
  { id: 1, name: 'Graduates Outcome Survey' },
  { id: 2, name: 'Employer Followup Survey' },
  { id: 3, name: 'Internal Team Alert' },
]

const notificationEventItems = mockNotificationEvents.map((ws) => ({ id: ws.id, label: ws.name }))

/**
 * TestNotificationForm Component
 * Allows admins to send test notifications for development/testing purposes
 */
const TestNotificationForm: FC = () => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement test notification send logic
    console.log('Send test notification clicked')
  }

  return (
    <div className="bg-light rounded p-4">
      <h3 className="h5 fw-bold mb-3">Send Test Notification</h3>
      <Form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
        <Select
          label="Notification Events"
          placeholder="select..."
          items={notificationEventItems}
          style={{ width: '100%' }}
        />
        <Select label="Recipients" placeholder="select..." items={[]} style={{ width: '100%' }} />
        <Select
          label="Notification Template"
          placeholder="select..."
          items={[]}
          style={{ width: '100%' }}
        />
        <TextField label="Subject/Title" style={{ width: '100%' }} />
        <Button variant="primary" type="submit" style={{ width: '100%' }}>
          Preview &amp; Send
        </Button>
      </Form>
    </div>
  )
}

export default TestNotificationForm
