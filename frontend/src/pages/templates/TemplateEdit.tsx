import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  TextField,
  RadioGroup,
  Radio,
  Tooltip,
  TooltipTrigger,
  SvgInfoIcon,
} from '@bcgov/design-system-react-components'
import {
  getTemplateById,
  updateTemplate,
  NotificationChannel,
  TemplateEngine,
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

const REQUIRED_FIELD_ERROR = 'This field is required.'
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

const TemplateEdit: FC<TemplateEditProps> = ({ templateId }) => {
  const navigate = useNavigate()
  const { primaryRole } = useCstarRoles()
  const isReadOnly = primaryRole === CstarRole.NOTIFY_VIEWER
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
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

  const handleCopyTemplateId = async () => {
    if (!template?.id) return

    try {
      await navigator.clipboard.writeText(template.id)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      showErrorToast('Failed to copy template ID')
    }
  }

  const validate = (): boolean => {
    const errors = { name: '', engineCode: '', subject: '', body: '' }
    if (!formData.name.trim()) {
      errors.name = REQUIRED_FIELD_ERROR
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
        <PageHeading title={isReadOnly ? 'View reusable template' : 'Edit reusable template'} />
        <form className="template-form" noValidate onSubmit={handleSave}>
          <div className="template-form__section template-form__section--title">
            <span className="bcds-react-aria-TextField--Label">API data: Template ID</span>
            <span className="bcds-react-aria-TextField--Description">{template.id}</span>
            <div>
              <Button type="button" variant="secondary" onClick={handleCopyTemplateId}>
                {copied ? 'Copied' : 'Copy template ID to clipboard'}
              </Button>
            </div>
          </div>

          <div className="template-form__section template-form__section--title">
            <TextField
              label="Template title"
              description="This will be the name of your template. Use a name that will help you easily find it later."
              value={formData.name}
              onChange={handleFieldChange('name')}
              {...({ placeholder: 'Type a template title' } as any)}
              className="template-form__field"
              size="small"
              isRequired
              isDisabled={isReadOnly}
              isInvalid={!!formErrors.name}
              errorMessage={formErrors.name}
            />
          </div>

          <div className="template-form__section template-form__section--template-type">
            <RadioGroup
              className="template-form__radio-group"
              label={(<RequiredLabel text="Template type" />) as unknown as string}
              value={formData.channelCode}
              onChange={(value) => setFormData((prev) => ({ ...prev, channelCode: value }))}
              aria-required="true"
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
                label="Subject line of the email"
                description="Use a subject line that clearly describes the email content."
                value={formData.subject}
                onChange={handleFieldChange('subject')}
                className="template-form__field template-form__field--full"
                size="small"
                isRequired
                isDisabled={isReadOnly}
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
                setFormErrors((prev) => ({ ...prev, engineCode: '' }))
              }}
              aria-required="true"
              isDisabled={isReadOnly}
              isInvalid={!!formErrors.engineCode}
              errorMessage={formErrors.engineCode}
            >
              {SYNTAX_TOOLTIPS.map((option) => (
                <div className="template-form__syntax-option" key={option.value}>
                  <Radio value={option.value}>{option.label}</Radio>
                  <TooltipTrigger>
                    <Button
                      aria-label={option.tooltipLabel}
                      className="template-form__syntax-tooltip-trigger"
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
              aria-label="Template body (required)"
              id="body"
              placeholder="Type the template body here"
              className={`form-control template-form__textarea${formErrors.body ? ' is-invalid' : ''}`}
              value={formData.body}
              onChange={(e) => handleFieldChange('body')(e.target.value)}
              readOnly={isReadOnly}
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
            {!isReadOnly && (
              <Button type="submit" isDisabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default TemplateEdit
