import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { createTemplate, NotificationChannel } from '@/api/templates.api'
import type { TemplateEngine } from '@/api/templates.api'
import { showSuccessToast } from '@/redux/utils/toastUtils'
import PageHeading from '@/components/PageHeading'
import TemplateForm from './TemplateForm'
import type { TemplateFormData } from './TemplateForm'

const TemplateCreate: FC = () => {
  const navigate = useNavigate()

  const handleSave = async (values: TemplateFormData) => {
    const template = await createTemplate({
      name: values.name,
      channelCode: values.channelCode as NotificationChannel,
      engineCode: values.engineCode as TemplateEngine,
      subject: values.channelCode === NotificationChannel.EMAIL ? values.subject : undefined,
      body: values.body,
    })
    showSuccessToast('Template created successfully')
    navigate({ to: '/template-edit/$templateId', params: { templateId: template.id } })
  }

  return (
    <div className="page page--narrow template-form-page">
      <PageHeading
        title="Create reusable template"
        breadcrumbs={[
          { label: 'Template', to: '/templates' },
          { label: 'Create reusable template' },
        ]}
      />
      <TemplateForm
        mode="create"
        onSave={handleSave}
        onCancel={() => navigate({ to: '/templates' })}
      />
    </div>
  )
}

export default TemplateCreate
