import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import Card from '@/components/Card'
import { getTemplates } from '@/api/templates.api'
import type { TemplateResponse, NotificationChannel } from '@/api/templates.api'
import { showErrorToast } from '@/redux/utils/toastUtils'

/**
 * Templates Page
 *
 * Displays a list of all notification templates for the current tenant.
 * Templates can be email, SMS, or push notifications with different template engines.
 */
const Templates: FC = () => {
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [totalCount, setTotalCount] = useState(0)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const response = await getTemplates(page, limit)
      // Handle both array and paginated response formats
      const templateList = Array.isArray(response) ? response : response.templates || []
      setTemplates(templateList)

      // Track count if available in response
      if (response && typeof response === 'object' && 'count' in response) {
        setTotalCount(response.count)
      }
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [page, limit])

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

      {totalCount > 0 && (
        <nav aria-label="Template pagination" className="mt-4">
          <ul className="pagination justify-content-center">
            <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
              <button
                className="page-link"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
            </li>
            <li className="page-item active">
              <span className="page-link">
                Page {page} of {Math.ceil(totalCount / limit)}
              </span>
            </li>
            <li className={`page-item ${page * limit >= totalCount ? 'disabled' : ''}`}>
              <button
                className="page-link"
                onClick={() => setPage(page + 1)}
                disabled={page * limit >= totalCount}
              >
                Next
              </button>
            </li>
          </ul>
        </nav>
      )}
    </div>
  )
}

export default Templates
