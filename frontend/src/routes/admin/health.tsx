import { createFileRoute } from '@tanstack/react-router'
import ServiceHealth from '@/pages/admin/monitoring/ServiceHealth'

export const Route = createFileRoute('/admin/health')({
  component: ServiceHealth,
})
