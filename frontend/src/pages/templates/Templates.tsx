import { useEffect } from 'react'
import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import Card from '@/components/Card'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchTemplates } from '@/redux/thunks/templates.thunks'
import type { NotificationChannel } from '@/api/templates.api'
import { showErrorToast } from '@/redux/utils/toastUtils'

/**
 * Templates Page
 *
 * Displays a list of all notification templates for the current tenant.
 * Templates can be email, SMS, or push notifications with different template engines.
 *
 * Listens to Redux for selected tenant changes and automatically fetches templates
 * for the selected tenant.
 */
const Templates: FC = () => {
  const dispatch = useAppDispatch()
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const templates = useAppSelector((state) => state.templates.items)
  const loading = useAppSelector((state) => state.templates.isLoading)
  const error = useAppSelector((state) => state.templates.error)

  // Fetch templates when tenant is selected
  // Only fetch if a tenant is selected
  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchTemplates())
    }
  }, [selectedTenant, dispatch])

  // Show error toast if fetch fails
  useEffect(() => {
    if (error) {
      showErrorToast(error)
    }
  }, [error])

  const getChannelBadgeClass = (channel: NotificationChannel | string): string => {
    switch (channel) {
      case 'email':
        return 'badge bg-primary'
      case 'sms':
        return 'badge bg-info'
      case 'push':
        return 'badge bg-warning'
      default:
        return 'badge bg-secondary'
    }
  }

  const getEngineBadgeClass = (engine: string): string => {
    switch (engine) {
      case 'handlebars':
        return 'badge bg-success'
      case 'mustache':
        return 'badge bg-secondary'
      default:
        return 'badge bg-light text-dark'
    }
  }

  if (loading) {
    return (
      <div className="p-3">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading templates...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col">
          <h1>Notification Templates</h1>
          <p className="text-muted">
            Manage email, SMS, and push notification templates for your tenants
          </p>
        </div>
      </div>

      <Card className="mb-4">
        {templates.length === 0 ? (
          <div className="p-3 text-muted">No templates found</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-hover" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Channel</th>
                  <th>Engine</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <div>
                        <strong>{template.name}</strong>
                        {template.description && (
                          <div className="text-muted small" title={template.description}>
                            {template.description.substring(0, 50)}
                            {template.description.length > 50 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={getChannelBadgeClass(template.channelCode)}>
                        {template.channelCode}
                      </span>
                    </td>
                    <td>
                      <span className={getEngineBadgeClass(template.engineCode)}>
                        {template.engineCode}
                      </span>
                    </td>
                    <td>v{template.version}</td>
                    <td>
                      <span className={`badge ${template.active ? 'bg-success' : 'bg-secondary'}`}>
                        {template.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td title={template.createdBy} className="text-truncate">
                      {template.createdBy}
                    </td>
                    <td title={new Date(template.createdAt).toLocaleString()}>
                      {new Date(template.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <Link
                        to="/template-edit/$templateId"
                        params={{ templateId: template.id }}
                        className="btn btn-sm btn-outline-primary"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default Templates
