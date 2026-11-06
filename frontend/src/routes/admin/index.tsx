import { createFileRoute } from '@tanstack/react-router'
import AdminOverview from '@/pages/admin/monitoring/AdminOverview'

export const Route = createFileRoute('/admin/')({
  component: AdminOverview,
})
