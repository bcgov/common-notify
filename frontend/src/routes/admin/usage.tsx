import { createFileRoute } from '@tanstack/react-router'
import AdminUsage from '@/pages/admin/AdminUsage'

export const Route = createFileRoute('/admin/usage')({
  component: AdminUsagePage,
})

function AdminUsagePage() {
  return <AdminUsage />
}
