import { createFileRoute } from '@tanstack/react-router'
import Workspaces from '@/containers/pages/workspaces/Workspaces'

export const Route = createFileRoute('/workspaces')({
  component: WorkspacesPage,
})

function WorkspacesPage() {
  return <Workspaces />
}
