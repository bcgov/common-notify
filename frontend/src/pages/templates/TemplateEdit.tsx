import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import Card from '@/components/Card'
import { getTemplateById } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

interface TemplateEditProps {
  templateId: string
}

/**
 * Template Edit Page
 *
 * Displays and allows editing of a notification template.
 */
const TemplateEdit: FC<TemplateEditProps> = ({ templateId }) => {
  const navigate = useNavigate()
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    body: '',
  })

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true)
      try {
        const data = await getTemplateById(templateId)
        setTemplate(data)
        setFormData({
          name: data.name,
          description: data.description || '',
          body: data.body || '',
        })
      } catch (error) {
        showErrorToast(error instanceof Error ? error.message : 'Failed to load template')
      } finally {
        setLoading(false)
      }
    }

    fetchTemplate()
  }, [templateId])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // TODO: Implement save API call
      // await updateTemplate(templateId, formData)
      showSuccessToast('Template saved successfully')
      // navigate({ to: '/templates' })
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate({ to: '/templates' })
  }

  if (loading) {
    return (
      <div className="p-3">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading template...</span>
        </div>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="container-fluid">
        <div className="alert alert-danger">Template not found</div>
        <Button onClick={handleCancel}>Back to Templates</Button>
      </div>
    )
  }

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col">
          <h1>Edit Template: {template.name}</h1>
          <p className="text-muted">
            Channel: {template.channelCode} | Engine: {template.engineCode}
          </p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSave}>
          <div className="mb-3">
            <label htmlFor="name" className="form-label">
              Template Name
            </label>
            <input
              type="text"
              className="form-control"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled
            />
            <small className="text-muted">Template name cannot be changed</small>
          </div>

          <div className="mb-3">
            <label htmlFor="description" className="form-label">
              Description
            </label>
            <textarea
              className="form-control"
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="body" className="form-label">
              Template Body
            </label>
            <textarea
              className="form-control"
              id="body"
              name="body"
              value={formData.body}
              onChange={handleInputChange}
              rows={10}
              style={{ fontFamily: 'monospace' }}
            />
            <small className="text-muted">
              Template uses {template.engineCode} engine for variable substitution
            </small>
          </div>

          <div className="row">
            <div className="col">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                style={{ marginLeft: '0.5rem' }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default TemplateEdit
