import { useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, TextField, RadioGroup, Radio } from '@bcgov/design-system-react-components'
import { createTemplate, NotificationChannel, TemplateEngine } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import '@/scss/components/templates.scss'

const REQUIRED_FIELD_ERROR = 'This field is required.'

const RequiredLabel = ({ text }: { text: string }) => (
  <span className="template-form__required-label">
    <span className="template-form__required-label-text">{text}</span>{' '}
    <span className="template-form__required-label-indicator">(required)</span>
  </span>
)

const TemplateCreate: FC = () => {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    channelCode: '' as string,
    engineCode: '' as string,
    subject: '',
    body: '',
  })
  const [formErrors, setFormErrors] = useState({
    name: '',
    channelCode: '',
    engineCode: '',
    subject: '',
    body: '',
  })

  const isSaveDisabled = saving || !formData.name.trim()

  const handleFieldChange = (field: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setFormErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validate = (): boolean => {
    const errors = {
      name: '',
      channelCode: '',
      engineCode: '',
      subject: '',
      body: '',
    }
    if (!formData.name.trim()) {
      errors.name = REQUIRED_FIELD_ERROR
    }
    if (!formData.channelCode) {
      errors.channelCode = 'Please select an option to continue.'
    }
    if (!formData.engineCode) {
      errors.engineCode = 'Please select an option to continue.'
    }
    if (formData.channelCode === NotificationChannel.EMAIL && !formData.subject.trim()) {
      errors.subject = REQUIRED_FIELD_ERROR
    }
    if (!formData.body.trim()) {
      errors.body = REQUIRED_FIELD_ERROR
    }
    setFormErrors(errors)
    return !Object.values(errors).some(Boolean)
  }

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await createTemplate({
        name: formData.name,
        channelCode: formData.channelCode as NotificationChannel,
        engineCode: formData.engineCode as TemplateEngine,
        subject: formData.channelCode === NotificationChannel.EMAIL ? formData.subject : undefined,
        body: formData.body,
      })
      showSuccessToast('Template created successfully')
      navigate({ to: '/templates' })
    } catch (error) {
      if ((error as any).status === 409) {
        setFormErrors((prev) => ({ ...prev, name: (error as Error).message }))
      } else {
        showErrorToast(error instanceof Error ? error.message : 'Failed to create template')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate({ to: '/templates' })
  }

  return (
    <div className="template-form-page">
      <div className="template-form-page__content">
        <PageHeading title="Create reusable template" />
        <form className="template-form" onSubmit={handleSave}>
          <div className="template-form__section template-form__section--title">
            <TextField
              label="Template title"
              description="This will be the name of your template. Use a name that will help you easily find it later."
              value={formData.name}
              onChange={handleFieldChange('name')}
              placeholder="Type a template title"
              className="template-form__field"
              size="small"
              isRequired
              isInvalid={!!formErrors.name}
              errorMessage={formErrors.name}
            />
          </div>

          <div className="template-form__section template-form__section--template-type">
            <RadioGroup
              className="template-form__radio-group"
              label={<RequiredLabel text="Template type" />}
              value={formData.channelCode}
              onChange={(value) => {
                setFormData((prev) => ({ ...prev, channelCode: value }))
                setFormErrors((prev) => ({ ...prev, channelCode: '' }))
              }}
              aria-required="true"
              isInvalid={!!formErrors.channelCode}
              errorMessage={formErrors.channelCode}
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
                label="Subject line of the email"
                description="Use a subject line that clearly describes the email content."
                value={formData.subject}
                onChange={handleFieldChange('subject')}
                className="template-form__field template-form__field--full"
                size="small"
                isRequired
                isInvalid={!!formErrors.subject}
                errorMessage={formErrors.subject}
              />
            </div>
          )}

          <div className="template-form__section template-form__section--syntax-type error-after-label">
            <RadioGroup
              className="template-form__radio-group"
              label={<RequiredLabel text="Syntax type" />}
              description="Choose the syntax used for dynamic variables and placeholders in this template."
              value={formData.engineCode}
              onChange={(value) => {
                setFormData((prev) => ({
                  ...prev,
                  engineCode: value,
                }))
                setFormErrors((prev) => ({
                  ...prev,
                  engineCode: '',
                }))
              }}
              aria-required="true"
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
              <RequiredLabel text="Template body" />
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
            <Button type="submit" isDisabled={isSaveDisabled}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TemplateCreate
