import { useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  TextField,
  RadioGroup,
  Radio,
  Tooltip,
  SvgInfoIcon,
} from '@bcgov/design-system-react-components'
import TooltipTrigger from '@/components/TooltipTrigger'
import { createTemplate, NotificationChannel, TemplateEngine } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import TemplatePreviewModal from './TemplatePreviewModal'
import SmsSegmentEstimate from './SmsSegmentEstimate'
import useAutoGrowingTextArea from '@/hooks/useAutoGrowingTextArea'
import '@/scss/components/templates.scss'

const REQUIRED_FIELD_ERROR = 'Please fill out this field to continue.'
const DEFAULT_TEMPLATE_BODY_PLACEHOLDER = 'Type the template body here'
const SYNTAX_TYPE_BODY_PLACEHOLDERS: Record<TemplateEngine, string> = {
  [TemplateEngine.MJML]: `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>
          Hello {{firstName}},
        </mj-text>

        <mj-text>
          Your request for {{eventName}} has been approved.
        </mj-text>

        <mj-text>
          Thank you,<br />
          Notify Team
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  [TemplateEngine.LEGACY_GC_NOTIFY]: `Hello ((name)),
Your -reference, file, other type of number: ((number))
Remember your appointment on ((date_en))
About: -Add description-
When: ((date_en))
What time: ((time_en)) -time zone in full, not acronym-
Where: ((address_en)) or -Add a link for a virtual appointment-`,
  [TemplateEngine.MUSTACHE]: `Hello {{firstName}},

Your notification for {{eventName}} has been successfully created.

Thank you,
Notify Team`,
  [TemplateEngine.HANDLEBARS]: `Hello {{firstName}},

{{#if isApproved}}
Your request for {{eventName}} has been approved.
{{else}}
Your request for {{eventName}} is still under review.
{{/if}}

Thank you,
Notify Team`,
}
const SYNTAX_TOOLTIPS = [
  {
    value: TemplateEngine.HANDLEBARS,
    label: 'Handlebars',
    tooltipLabel: 'About Handlebars syntax',
    tooltipText:
      'A templating language that uses placeholders (e.g., {{firstName}}) and supports helpers, conditions, and loops for creating dynamic content.',
  },
  {
    value: TemplateEngine.MUSTACHE,
    label: 'Mustache',
    tooltipLabel: 'About Mustache syntax',
    tooltipText:
      'A logic-less templating language that uses placeholders (e.g., {{firstName}}) to insert dynamic values into templates.',
  },
  {
    value: TemplateEngine.LEGACY_GC_NOTIFY,
    label: 'GC Notify (legacy)',
    tooltipLabel: 'About GC Notify legacy syntax',
    tooltipText:
      'Legacy syntax used by GC Notify templates. Select this when importing or editing templates created with GC Notify.',
  },
  {
    value: TemplateEngine.MJML,
    label: 'MJML',
    tooltipLabel: 'About MJML syntax',
    tooltipText:
      'A markup language for building responsive HTML emails that render consistently across email clients.',
  },
] as const

const RequiredLabel = ({ text }: { text: string }) => (
  <span className="template-form__required-label">
    <span className="template-form__required-label-text">{text}</span>
    <span className="template-form__required-label-indicator">(required)</span>
  </span>
)

const TemplateCreate: FC = () => {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
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
  const templateBodyPlaceholder =
    SYNTAX_TYPE_BODY_PLACEHOLDERS[formData.engineCode as TemplateEngine] ??
    DEFAULT_TEMPLATE_BODY_PLACEHOLDER
  const bodyTextareaRef = useAutoGrowingTextArea(formData.body, {
    measurementText: formData.engineCode ? templateBodyPlaceholder : undefined,
  })

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
      const template = await createTemplate({
        name: formData.name,
        channelCode: formData.channelCode as NotificationChannel,
        engineCode: formData.engineCode as TemplateEngine,
        subject: formData.channelCode === NotificationChannel.EMAIL ? formData.subject : undefined,
        body: formData.body,
      })
      showSuccessToast('Template created successfully')
      navigate({ to: '/template-edit/$templateId', params: { templateId: template.id } })
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
    <div className="page page--narrow template-form-page">
      <PageHeading
        title="Create reusable template"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Templates', to: '/templates' },
          { label: 'Create reusable template' },
        ]}
      />
      <form className="template-form" noValidate onSubmit={handleSave}>
        <div className="template-form__questions">
          <div className="template-form__section template-form__section--title">
            <TextField
              label="Template title"
              description="This will be the name of your template. Use a name that will help you easily find it later."
              value={formData.name}
              onChange={handleFieldChange('name')}
              {...({ placeholder: 'Type a template title' } as any)}
              className="bcds-react-aria-TextField template-form__field"
              size="small"
              isRequired
              isInvalid={!!formErrors.name}
              errorMessage={formErrors.name}
            />
          </div>

          <div className="template-form__section template-form__section--template-type">
            <RadioGroup
              className="template-form__radio-group"
              label={(<RequiredLabel text="Template type" />) as unknown as string}
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
                className="bcds-react-aria-TextField template-form__field template-form__field--full"
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
              label={(<RequiredLabel text="Syntax type" />) as unknown as string}
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
              {SYNTAX_TOOLTIPS.map((option) => (
                <div className="template-form__syntax-option" key={option.value}>
                  <Radio value={option.value}>{option.label}</Radio>
                  <TooltipTrigger>
                    <Button
                      aria-label={option.tooltipLabel}
                      isIconButton
                      size="xsmall"
                      type="button"
                      variant="tertiary"
                    >
                      <SvgInfoIcon />
                    </Button>
                    <Tooltip placement="left">{option.tooltipText}</Tooltip>
                  </TooltipTrigger>
                </div>
              ))}
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
              ref={bodyTextareaRef}
              aria-label="Template body (required)"
              id="body"
              placeholder={templateBodyPlaceholder}
              className={`form-control template-form__textarea${formErrors.body ? ' is-invalid' : ''}`}
              value={formData.body}
              onChange={(e) => handleFieldChange('body')(e.target.value)}
            />
            {formErrors.body && (
              <span className="bcds-react-aria-TextField--Error">{formErrors.body}</span>
            )}
            {formData.channelCode === NotificationChannel.SMS && (
              <SmsSegmentEstimate body={formData.body} />
            )}
          </div>
        </div>

        <div className="template-form__actions">
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onPress={() => setPreviewOpen(true)}
            isDisabled={!formData.body.trim() || !formData.channelCode || !formData.engineCode}
          >
            Preview
          </Button>
          <Button type="submit" isDisabled={isSaveDisabled}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>

      <TemplatePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        body={formData.body}
        subject={formData.subject}
        channelCode={formData.channelCode as NotificationChannel}
        engineCode={formData.engineCode as TemplateEngine}
      />
    </div>
  )
}

export default TemplateCreate
