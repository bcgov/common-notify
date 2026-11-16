import { createFileRoute } from '@tanstack/react-router'
import AdminUsage from '@/pages/admin/AdminUsage'

export const Route = createFileRoute('/admin/tenants')({
  component: ManageTenantsPage,
})

function ManageTenantsPage() {
  return <AdminUsage />
}
