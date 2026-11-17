import { createFileRoute } from '@tanstack/react-router'
import Dashboard from '@/pages/dashboard/Dashboard'
import FeatureAccessGate from '@/components/FeatureAccessGate'
import { useDashboardAccess } from '@/hooks/useDashboardAccess'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const access = useDashboardAccess()

  return (
    <FeatureAccessGate {...access}>
      <Dashboard />
    </FeatureAccessGate>
  )
}
