import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button, Form, Select, TextField } from '@bcgov/design-system-react-components'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchTemplates } from '@/redux/thunks/templates.thunks'
import '@/scss/components/test-notification-form.scss'

const mockNotificationEventItems = [
  { id: '1', label: 'New Order Ready' },
  { id: '2', label: 'Extra Cheese Requested' },
]

/**
 * Largely mocked, requirements not fully known so this
 * will change in the future.
 */
const TestNotificationForm: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const templates = useAppSelector((state) => state.templates.items)

  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchTemplates())
    }
  }, [dispatch, selectedTenant])

  const templateItems = templates.map((t, index) => ({ id: String(t.id ?? index), label: t.name }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement test notification send logic
  }

  return (
    <div className="test-notification-form">
      <h3 className="test-notification-form__title">Test Notification Event Setting</h3>
      <Form className="test-notification-form__fields" onSubmit={handleSubmit}>
        <Select
          key="notification-events-select"
          label="Notification Events"
          placeholder="select..."
          items={mockNotificationEventItems}
          style={{ width: '100%' }}
        />
        <Select
          key="template-select"
          label="Notification Template"
          placeholder="select..."
          items={templateItems}
          style={{ width: '100%' }}
        />
        <TextField label="Notification Title" style={{ width: '100%' }} />
        <div>
          <label className="test-notification-form__recipient-label">Recipient(s)</label>
          <div className="test-notification-form__recipient-row">
            <input
              type="text"
              placeholder="Type an email address"
              aria-label="Recipient email address"
              className="test-notification-form__recipient-input"
            />
            <button
              type="button"
              className="test-notification-form__recipient-toggle"
              onClick={() => setShowCc((v) => !v)}
            >
              {showCc ? '- Cc' : '+ Cc'}
            </button>
            <button
              type="button"
              className="test-notification-form__recipient-toggle test-notification-form__recipient-toggle--last"
              onClick={() => setShowBcc((v) => !v)}
            >
              {showBcc ? '- Bcc' : '+ Bcc'}
            </button>
          </div>
          {showCc && (
            <div className="test-notification-form__cc-bcc-row">
              <span className="test-notification-form__cc-bcc-label">Cc:</span>
              <input
                type="text"
                placeholder="Type an email address"
                aria-label="Cc email address"
                className="test-notification-form__recipient-input test-notification-form__recipient-input--last"
              />
            </div>
          )}
          {showBcc && (
            <div className="test-notification-form__cc-bcc-row">
              <span className="test-notification-form__cc-bcc-label">Bcc:</span>
              <input
                type="text"
                placeholder="Type an email address"
                aria-label="Bcc email address"
                className="test-notification-form__recipient-input test-notification-form__recipient-input--last"
              />
            </div>
          )}
        </div>
        <div className="test-notification-form__actions">
          <Button variant="secondary">Preview</Button>
          <Button variant="primary" type="submit">
            Send
          </Button>
        </div>
      </Form>
    </div>
  )
}

export default TestNotificationForm
