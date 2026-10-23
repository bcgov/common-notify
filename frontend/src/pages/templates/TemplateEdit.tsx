import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import { getTemplateById, updateTemplate, NotificationChannel } from '@/api/templates.api'
import type { TemplateEngine, TemplateResponse } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { CstarRole } from '@/enum/cstar-role.enum'
import TemplateForm from './TemplateForm'
import type { TemplateFormData } from './TemplateForm'

interface TemplateEditProps {
  templateId: string
}

const TemplateEdit: FC<TemplateEditProps> = ({ templateId }) => {
  const navigate = useNavigate()
  const { primaryRole } = useCstarRoles()
  const isReadOnly = primaryRole === CstarRole.NOTIFY_VIEWER

  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true)

      try {
        const data = await getTemplateById(templateId)

        setTemplate(data)
      } catch (error) {
        showErrorToast(error instanceof Error ? error.message : 'Failed to load template')
      } finally {
        setLoading(false)
      }
    }

    void fetchTemplate()
  }, [templateId])

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

  const handleSave = async (values: TemplateFormData) => {
    await updateTemplate(templateId, {
      name: values.name,
      engineCode: values.engineCode as TemplateEngine,
      subject: values.channelCode === NotificationChannel.EMAIL ? values.subject : undefined,
      body: values.body,
    })
    showSuccessToast('Template saved successfully')
    navigate({ to: '/templates' })
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
    <div className="page page--narrow template-form-page">
      <PageHeading
        title={isReadOnly ? 'View reusable template' : 'Edit reusable template'}
        breadcrumbs={[
          { label: 'Template', to: '/templates' },
          {
            label: isReadOnly ? 'View reusable template' : 'Edit reusable template',
          },
        ]}
      />

      <TemplateForm
        key={template.id}
        mode="edit"
        initialValues={{
          name: template.name,
          channelCode: template.channelCode,
          engineCode: template.engineCode,
          subject: template.subject || '',
          body: template.body || '',
        }}
        isReadOnly={isReadOnly}
        onSave={handleSave}
        onCancel={handleCancel}
      >
        <div className="template-form__section template-form__section--api-data">
          <span className="bcds-react-aria-TextField--Label">API data: Template ID</span>

          <span className="bcds-react-aria-TextField--Description">{template.id}</span>

          <div>
            <Button type="button" variant="secondary" onClick={handleCopyTemplateId}>
              {copied ? 'Copied' : 'Copy template ID to clipboard'}
            </Button>
          </div>
        </div>
      </TemplateForm>
    </div>
  )
}

export default TemplateEdit
