import { createFileRoute } from '@tanstack/react-router'
import Dashboard from '@/pages/dashboard/Dashboard'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  return <Dashboard />
}
