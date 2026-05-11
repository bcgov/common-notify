import type { FC } from 'react'
import { useState } from 'react'
import { Form, Row, Col, Button } from 'react-bootstrap'
import Card from '@/components/Card'
import PageHeading from '@/components/PageHeading'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'

const Settings: FC = () => {
  const [settings, setSettings] = useState({
    // User Preferences
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    twoFactorEnabled: false,
    theme: 'light',

    // API Settings
    apiTimeoutSeconds: 30,
    retryAttempts: 3,
    enableDetailedLogs: false,

    // Notification Delivery
    batchNotifications: true,
    batchSize: 100,
    dailySchedule: '09:00',

    // System
    maintenanceMode: false,
    autoBackup: true,
    backupFrequency: 'daily',
  })

  const [isSaving, setIsSaving] = useState(false)

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: typeof prev[key] === 'boolean' ? !prev[key] : prev[key],
    }))
  }

  const handleChange = (key: keyof typeof settings, value: string | number) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      showSuccessToast('Settings saved successfully')
    } catch {
      showErrorToast('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <PageHeading title="Settings" />

      {/* User Preferences */}
      <Card title="User Preferences" className="mb-4">
        <div className="mb-4">
          <h6 className="fw-bold mb-3">Notification Channels</h6>
          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label="Email Notifications"
              checked={settings.emailNotifications}
              onChange={() => handleToggle('emailNotifications')}
              id="emailNotifications"
            />
            <Form.Text className="text-muted d-block mt-1">
              Receive notifications via email
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label="SMS Notifications"
              checked={settings.smsNotifications}
              onChange={() => handleToggle('smsNotifications')}
              id="smsNotifications"
            />
            <Form.Text className="text-muted d-block mt-1">Receive notifications via SMS</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label="Push Notifications"
              checked={settings.pushNotifications}
              onChange={() => handleToggle('pushNotifications')}
              id="pushNotifications"
            />
            <Form.Text className="text-muted d-block mt-1">
              Receive notifications via browser push
            </Form.Text>
          </Form.Group>
        </div>

        <hr />

        <div className="mb-4">
          <h6 className="fw-bold mb-3">Security</h6>
          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label="Enable Two-Factor Authentication"
              checked={settings.twoFactorEnabled}
              onChange={() => handleToggle('twoFactorEnabled')}
              id="twoFactorEnabled"
            />
            <Form.Text className="text-muted d-block mt-1">
              Require additional verification when logging in
            </Form.Text>
          </Form.Group>
        </div>

        <div>
          <h6 className="fw-bold mb-3">Appearance</h6>
          <Form.Group>
            <Form.Label htmlFor="theme">Theme</Form.Label>
            <Form.Select
              id="theme"
              value={settings.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
              className="w-25"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </Form.Select>
          </Form.Group>
        </div>
      </Card>

      {/* API Configuration */}
      <Card title="API Configuration" className="mb-4">
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="apiTimeout">Request Timeout (seconds)</Form.Label>
              <Form.Control
                id="apiTimeout"
                type="number"
                min="5"
                max="300"
                value={settings.apiTimeoutSeconds}
                onChange={(e) => handleChange('apiTimeoutSeconds', parseInt(e.target.value))}
              />
              <Form.Text className="text-muted">Maximum time to wait for API responses</Form.Text>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="retryAttempts">Retry Attempts</Form.Label>
              <Form.Control
                id="retryAttempts"
                type="number"
                min="0"
                max="10"
                value={settings.retryAttempts}
                onChange={(e) => handleChange('retryAttempts', parseInt(e.target.value))}
              />
              <Form.Text className="text-muted">Number of times to retry failed requests</Form.Text>
            </Form.Group>
          </Col>
        </Row>

        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            label="Enable Detailed Logs"
            checked={settings.enableDetailedLogs}
            onChange={() => handleToggle('enableDetailedLogs')}
            id="enableDetailedLogs"
          />
          <Form.Text className="text-muted d-block mt-1">
            Store detailed logs for API requests and responses
          </Form.Text>
        </Form.Group>
      </Card>

      {/* Notification Delivery */}
      <Card title="Notification Delivery" className="mb-4">
        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            label="Batch Notifications"
            checked={settings.batchNotifications}
            onChange={() => handleToggle('batchNotifications')}
            id="batchNotifications"
          />
          <Form.Text className="text-muted d-block mt-1">
            Group notifications together before sending
          </Form.Text>
        </Form.Group>

        {settings.batchNotifications && (
          <Row className="mb-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="batchSize">Batch Size</Form.Label>
                <Form.Control
                  id="batchSize"
                  type="number"
                  min="1"
                  max="1000"
                  value={settings.batchSize}
                  onChange={(e) => handleChange('batchSize', parseInt(e.target.value))}
                />
                <Form.Text className="text-muted">Notifications per batch</Form.Text>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="dailySchedule">Daily Batch Schedule</Form.Label>
                <Form.Control
                  id="dailySchedule"
                  type="time"
                  value={settings.dailySchedule}
                  onChange={(e) => handleChange('dailySchedule', e.target.value)}
                />
                <Form.Text className="text-muted">Time to send batched notifications</Form.Text>
              </Form.Group>
            </Col>
          </Row>
        )}
      </Card>

      {/* System Settings */}
      <Card title="System Settings" className="mb-4">
        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            label="Maintenance Mode"
            checked={settings.maintenanceMode}
            onChange={() => handleToggle('maintenanceMode')}
            id="maintenanceMode"
          />
          <Form.Text className="text-muted d-block mt-1">
            Disable notifications during maintenance windows
          </Form.Text>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            label="Enable Auto Backup"
            checked={settings.autoBackup}
            onChange={() => handleToggle('autoBackup')}
            id="autoBackup"
          />
          <Form.Text className="text-muted d-block mt-1">
            Automatically backup system data
          </Form.Text>
        </Form.Group>

        {settings.autoBackup && (
          <Form.Group className="mb-3">
            <Form.Label htmlFor="backupFrequency">Backup Frequency</Form.Label>
            <Form.Select
              id="backupFrequency"
              value={settings.backupFrequency}
              onChange={(e) => handleChange('backupFrequency', e.target.value)}
              className="w-25"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Form.Select>
          </Form.Group>
        )}
      </Card>

      {/* Save Button */}
      <div className="d-flex gap-2">
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
        <Button variant="outline-secondary" onClick={() => window.location.reload()}>
          Reset
        </Button>
      </div>
    </div>
  )
}

export default Settings
