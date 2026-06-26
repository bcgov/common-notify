import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, TextField, RadioGroup, Radio } from '@bcgov/design-system-react-components'
import {
  getTemplateById,
  updateTemplate,
  NotificationChannel,
  TemplateEngine,
  TemplateBodyType,
} from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { CstarRole } from '@/enum/cstar-role.enum'
import '@/scss/components/templates.scss'

interface TemplateEditProps {
  templateId: string
}

const TemplateEdit: FC<TemplateEditProps> = ({ templateId }) => {
  const navigate = useNavigate()
  const { primaryRole } = useCstarRoles()
  const isReadOnly = primaryRole === CstarRole.NOTIFY_VIEWER
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    channelCode: NotificationChannel.EMAIL as string,
    engineCode: TemplateEngine.HANDLEBARS as string,
    bodyType: '' as string,
    subject: '',
    body: '',
  })
  const [formErrors, setFormErrors] = useState({
    name: '',
    engineCode: '',
    bodyType: '',
    subject: '',
    body: '',
  })
  const isMjml = formData.engineCode === TemplateEngine.MJML

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
          bodyType: data.bodyType || '',
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
    setFormErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validate = (): boolean => {
    const errors = { name: '', engineCode: '', bodyType: '', subject: '', body: '' }
    if (!formData.name.trim()) {
      errors.name = ' '
    }
    if (!formData.engineCode) {
      errors.engineCode = 'Please select an option to continue.'
    }
    if (!isMjml && !formData.bodyType) {
      errors.bodyType = 'Please select an option to continue.'
    }
    if (formData.channelCode === NotificationChannel.EMAIL && !formData.subject.trim()) {
      errors.subject = ' '
    }
    if (!formData.body.trim()) {
      errors.body = ' '
    }
    setFormErrors(errors)
    return !Object.values(errors).some(Boolean)
  }

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await updateTemplate(templateId, {
        name: formData.name,
        engineCode: formData.engineCode as TemplateEngine,
        subject: formData.channelCode === NotificationChannel.EMAIL ? formData.subject : undefined,
        body: formData.body,
        ...(!isMjml && formData.bodyType
          ? { bodyType: formData.bodyType as TemplateBodyType }
          : {}),
      })
      showSuccessToast('Template saved successfully')
      navigate({ to: '/templates' })
    } catch (error) {
      if ((error as any).status === 409) {
        setFormErrors((prev) => ({ ...prev, name: (error as Error).message }))
      } else {
        showErrorToast(error instanceof Error ? error.message : 'Failed to save template')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate({ to: '/templates' })
  }

  if (loading) {
    return null
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
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <PageHeading title={isReadOnly ? 'View reusable template' : 'Edit reusable template'} />
        <form onSubmit={handleSave}>
          <div className="mb-4 desc-above">
            <TextField
              label={
                (
                  <>
                    <strong>Template title</strong> (required)
                  </>
                ) as any
              }
              description="This will be the name of your template. Use a name that will help you easily find it later."
              value={formData.name}
              onChange={handleFieldChange('name')}
              style={{ maxWidth: '400px' }}
              isDisabled={isReadOnly}
              isInvalid={!!formErrors.name}
              errorMessage={formErrors.name}
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
              <Radio key="email" value={NotificationChannel.EMAIL}>
                Email
              </Radio>
              <Radio key="sms" value={NotificationChannel.SMS}>
                SMS
              </Radio>
            </RadioGroup>
          </div>

          <div className="mb-4 error-after-label">
            <RadioGroup
              label={
                (
                  <>
                    <strong>Template engine</strong> (required)
                  </>
                ) as any
              }
              value={formData.engineCode}
              onChange={(value) => {
                setFormData((prev) => ({
                  ...prev,
                  engineCode: value,
                  bodyType: value === TemplateEngine.MJML ? '' : prev.bodyType,
                }))
                setFormErrors((prev) => ({ ...prev, engineCode: '', bodyType: '' }))
              }}
              isDisabled={isReadOnly}
              isInvalid={!!formErrors.engineCode}
              errorMessage={formErrors.engineCode}
            >
              <Radio key="handlebars" value={TemplateEngine.HANDLEBARS}>
                Handlebars
              </Radio>
              <Radio key="mustache" value={TemplateEngine.MUSTACHE}>
                Mustache
              </Radio>
              <Radio key="legacy" value={TemplateEngine.LEGACY_GC_NOTIFY}>
                Legacy GC Notify
              </Radio>
              <Radio key="mjml" value={TemplateEngine.MJML}>
                MJML
              </Radio>
            </RadioGroup>
          </div>

          {!isMjml && (
            <div className="mb-4 error-after-label">
              <RadioGroup
                label={
                  (
                    <>
                      <strong>Body type</strong> (required)
                    </>
                  ) as any
                }
                value={formData.bodyType}
                onChange={(value) => {
                  setFormData((prev) => ({ ...prev, bodyType: value }))
                  setFormErrors((prev) => ({ ...prev, bodyType: '' }))
                }}
                isDisabled={isReadOnly}
                isInvalid={!!formErrors.bodyType}
                errorMessage={formErrors.bodyType}
              >
                <Radio key="html" value={TemplateBodyType.HTML}>
                  HTML
                </Radio>
                <Radio key="markdown" value={TemplateBodyType.MARKDOWN}>
                  Markdown
                </Radio>
              </RadioGroup>
            </div>
          )}

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
                isDisabled={isReadOnly}
                isInvalid={!!formErrors.subject}
                errorMessage={formErrors.subject}
              />
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="body" className="bcds-react-aria-TextField--Label">
              <strong>Template body</strong> (required)
            </label>
            <textarea
              id="body"
              className={`form-control${formErrors.body ? ' is-invalid' : ''}`}
              value={formData.body}
              onChange={(e) => handleFieldChange('body')(e.target.value)}
              style={
                isReadOnly
                  ? { width: '100%', height: '16rem', color: '#9f9d9c', backgroundColor: '#EDEBE9' }
                  : { width: '100%', height: '16rem' }
              }
              readOnly={isReadOnly}
            />
            {formErrors.body && (
              <span className="bcds-react-aria-TextField--Error">{formErrors.body}</span>
            )}
          </div>

          <div className="d-flex justify-content-end gap-2">
            <>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onPress={() => {}} isDisabled={true}>
                Preview
              </Button>
              {!isReadOnly && (
                <Button type="submit" isDisabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TemplateEdit
