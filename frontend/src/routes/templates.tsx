import { createFileRoute } from '@tanstack/react-router'
import Templates from '@/containers/pages/templates/Templates'

export const Route = createFileRoute('/templates')({
  component: TemplatesPage,
})

function TemplatesPage() {
  return <Templates />
}
