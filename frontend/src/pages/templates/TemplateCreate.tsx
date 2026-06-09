import { useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, TextField, RadioGroup, Radio } from '@bcgov/design-system-react-components'
import {
  createTemplate,
  NotificationChannel,
  TemplateEngine,
  TemplateBodyType,
} from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import '@/scss/components/templates.scss'

const TemplateCreate: FC = () => {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    channelCode: '' as string,
    engineCode: '' as string,
    bodyType: '' as string,
    subject: '',
    body: '',
  })
  const [formErrors, setFormErrors] = useState({
    name: '',
    channelCode: '',
    engineCode: '',
    bodyType: '',
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
      bodyType: '',
      subject: '',
      body: '',
    }
    if (!formData.name.trim()) {
      errors.name = ' '
    }
    if (!formData.channelCode) {
      errors.channelCode = 'Please select an option to continue.'
    }
    if (!formData.engineCode) {
      errors.engineCode = 'Please select an option to continue.'
    }
    if (!formData.bodyType) {
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
      await createTemplate({
        name: formData.name,
        channelCode: formData.channelCode as NotificationChannel,
        engineCode: formData.engineCode as TemplateEngine,
        bodyType: formData.bodyType as TemplateBodyType,
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
    <div>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <PageHeading title="Create reusable template" />
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
              onChange={(value) => {
                setFormData((prev) => ({ ...prev, channelCode: value }))
                setFormErrors((prev) => ({ ...prev, channelCode: '' }))
              }}
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
                setFormData((prev) => ({ ...prev, engineCode: value }))
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
                Legacy GC Notify
              </Radio>
              <Radio key="mjml" value={TemplateEngine.MJML}>
                MJML
              </Radio>
            </RadioGroup>
          </div>

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
              style={{ width: '100%', height: '16rem' }}
            />
            {formErrors.body && (
              <span className="bcds-react-aria-TextField--Error">{formErrors.body}</span>
            )}
          </div>

          <div className="d-flex justify-content-end gap-2">
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
