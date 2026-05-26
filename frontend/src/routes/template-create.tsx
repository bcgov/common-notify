import { createFileRoute } from '@tanstack/react-router'
import TemplateCreate from '@/pages/templates/TemplateCreate'

export const Route = createFileRoute('/template-create')({
  component: TemplateCreate,
})
