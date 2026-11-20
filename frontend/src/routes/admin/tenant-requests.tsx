import { createFileRoute } from '@tanstack/react-router'
import AdminTenantRequests from '@/pages/admin/tenant-requests/AdminTenantRequests'

export const Route = createFileRoute('/admin/tenant-requests')({
  component: AdminTenantRequests,
})
