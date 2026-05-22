import { createFileRoute } from '@tanstack/react-router'
import TemplateEdit from '@/pages/templates/TemplateEdit'

export const Route = createFileRoute('/template-edit/$templateId')({
  component: TemplateEditPage,
})

function TemplateEditPage() {
  const params = Route.useParams()
  return <TemplateEdit templateId={params.templateId} />
}
