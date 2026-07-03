import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, TextField, RadioGroup, Radio } from '@bcgov/design-system-react-components'
import {
  getTemplateById,
  updateTemplate,
  NotificationChannel,
  TemplateEngine,
} from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import '@/scss/components/templates.scss'

const renderRequiredLabel = (label: string) => (
  <>
    <span className="template-form__label-text">{label}</span>
    <span className="template-form__required-text">(required)</span>
  </>
)

interface TemplateEditProps {
  templateId: string
}

const TemplateEdit: FC<TemplateEditProps> = ({ templateId }) => {
  const navigate = useNavigate()
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    channelCode: NotificationChannel.EMAIL as string,
    engineCode: TemplateEngine.HANDLEBARS as string,
    subject: '',
    body: '',
  })
  const [formErrors, setFormErrors] = useState({
    name: '',
    engineCode: '',
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
    setFormErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validate = (): boolean => {
    const errors = { name: '', engineCode: '', subject: '', body: '' }
    if (!formData.name.trim()) {
      errors.name = ' '
    }
    if (!formData.engineCode) {
      errors.engineCode = 'Please select an option to continue.'
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
    <div className="template-form-page">
      <div className="template-form-page__content">
        <PageHeading title="Edit reusable template" />
        <form className="template-form" onSubmit={handleSave}>
          <div className="template-form__section template-form__section--title">
            <TextField
              label={renderRequiredLabel('Template title') as any}
              description="This will be the name of your template. Use a name that will help you easily find it later."
              value={formData.name}
              onChange={handleFieldChange('name')}
              className="template-form__field"
              size="small"
              isInvalid={!!formErrors.name}
              errorMessage={formErrors.name}
            />
          </div>

          <div className="template-form__section template-form__section--template-type">
            <RadioGroup
              className="template-form__radio-group"
              label={renderRequiredLabel('Template type') as any}
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

          {formData.channelCode === NotificationChannel.EMAIL && (
            <div className="template-form__section template-form__section--subject">
              <TextField
                label={renderRequiredLabel('Subject line of the email') as any}
                description="Use a subject line that clearly describes the email content."
                value={formData.subject}
                onChange={handleFieldChange('subject')}
                className="template-form__field template-form__field--full"
                size="small"
                isInvalid={!!formErrors.subject}
                errorMessage={formErrors.subject}
              />
            </div>
          )}

          <div className="template-form__section template-form__section--syntax-type error-after-label">
            <RadioGroup
              className="template-form__radio-group"
              label={renderRequiredLabel('Syntax type') as any}
              description="Choose the syntax used for dynamic variables and placeholders in this template."
              value={formData.engineCode}
              onChange={(value) => {
                setFormData((prev) => ({
                  ...prev,
                  engineCode: value,
                }))
                setFormErrors((prev) => ({ ...prev, engineCode: '' }))
              }}
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
                GC Notify (legacy)
              </Radio>
              <Radio key="mjml" value={TemplateEngine.MJML}>
                MJML
              </Radio>
            </RadioGroup>
          </div>

          <div className="template-form__section template-form__section--body">
            <label
              htmlFor="body"
              className="bcds-react-aria-TextField--Label template-form__body-label"
            >
              <span className="template-form__label-text">Template body</span>
              <span className="template-form__required-text">(required)</span>
            </label>
            <textarea
              aria-label="Template body (required)"
              id="body"
              placeholder="Type the template body here"
              className={`form-control template-form__textarea${formErrors.body ? ' is-invalid' : ''}`}
              value={formData.body}
              onChange={(e) => handleFieldChange('body')(e.target.value)}
            />
            {formErrors.body && (
              <span className="bcds-react-aria-TextField--Error">{formErrors.body}</span>
            )}
          </div>

          <div className="template-form__actions d-flex justify-content-end gap-2">
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
