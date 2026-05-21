import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, TextField, RadioGroup, Radio } from '@bcgov/design-system-react-components'
import {
  getTemplateById,
  updateTemplate,
  previewTemplate,
  NotificationChannel,
  TemplateEngine,
} from '@/api/templates.api'
import type { TemplateResponse, PreviewTemplateResponse } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import '@/scss/components/templates.scss'

interface TemplateEditProps {
  templateId: string
}

const TemplateEdit: FC<TemplateEditProps> = ({ templateId }) => {
  const navigate = useNavigate()
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [_, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    channelCode: NotificationChannel.EMAIL as string,
    engineCode: TemplateEngine.HANDLEBARS as string,
    subject: '',
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
          channelCode: data.channelCode,
          engineCode: data.engineCode,
          subject: data.subject || '',
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

  const handleFieldChange = (field: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateTemplate(templateId, {
        engineCode: formData.engineCode as TemplateEngine,
        subject: formData.channelCode === NotificationChannel.EMAIL ? formData.subject : undefined,
        body: formData.body,
      })
      showSuccessToast('Template saved successfully')
      navigate({ to: '/templates' })
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate({ to: '/templates' })
  }

  if (!template) {
    return (
      <div>
        <div className="alert alert-danger">Template not found</div>
        <Button onClick={handleCancel}>Back to Templates</Button>
      </div>
    )
  }

  return (
    <div>
      <PageHeading title="Edit template" />
      <div style={{ maxWidth: '800px' }}>
        <form onSubmit={handleSave}>
          <div className="mb-4 desc-above">
            <TextField
              label={
                (
                  <>
                    <strong>Template title</strong>
                  </>
                ) as any
              }
              description="This will be the name of your template. Use a name that will help you easily find it later."
              value={formData.name}
              isDisabled
              style={{ maxWidth: '400px' }}
            />
          </div>

          <div className="mb-4">
            <RadioGroup
              label={
                (
                  <>
                    <strong>Template type</strong> (required)
                  </>
                ) as any
              }
              value={formData.channelCode}
              onChange={(value) => setFormData((prev) => ({ ...prev, channelCode: value }))}
              isDisabled
            >
              <Radio value={NotificationChannel.EMAIL}>Email</Radio>
              <Radio value={NotificationChannel.SMS}>SMS</Radio>
            </RadioGroup>
          </div>

          <div className="mb-4">
            <RadioGroup
              label={
                (
                  <>
                    <strong>Template engine</strong> (required)
                  </>
                ) as any
              }
              value={formData.engineCode}
              onChange={(value) => setFormData((prev) => ({ ...prev, engineCode: value }))}
            >
              <Radio value={TemplateEngine.HANDLEBARS}>Handlebars</Radio>
              <Radio value={TemplateEngine.MUSTACHE}>Mustache</Radio>
              <Radio value={TemplateEngine.LEGACY_GC_NOTIFY}>Legacy GC Notify</Radio>
              <Radio value={TemplateEngine.EJS}>EJS</Radio>
            </RadioGroup>
          </div>

          {formData.channelCode === NotificationChannel.EMAIL && (
            <div className="mb-4 desc-above">
              <TextField
                label={
                  (
                    <>
                      <strong>Subject line of the email</strong> (required)
                    </>
                  ) as any
                }
                description="Use a subject line that clearly describes the email content."
                value={formData.subject}
                onChange={handleFieldChange('subject')}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="body" className="bcds-react-aria-TextField--Label">
              <strong>Template body</strong> (required)
            </label>
            <textarea
              id="body"
              className="form-control"
              value={formData.body}
              onChange={(e) => handleFieldChange('body')(e.target.value)}
              style={{ width: '100%', height: '16rem' }}
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <Button type="button" variant="secondary" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onPress={() => {}} isDisabled={true}>
              Preview
            </Button>
            <Button type="submit" isDisabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TemplateEdit
