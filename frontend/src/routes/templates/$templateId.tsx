import { createFileRoute } from '@tanstack/react-router'
import TemplateEdit from '@/pages/templates/TemplateEdit'

export const Route = createFileRoute('/templates/$templateId')({
  component: TemplateEditPage,
})

function TemplateEditPage() {
  const params = Route.useParams()
  return <TemplateEdit templateId={params.templateId} />
}
