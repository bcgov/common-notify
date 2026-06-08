import { createFileRoute } from '@tanstack/react-router'
import AdminApiKeys from '@/pages/admin/AdminApiKeys'

export const Route = createFileRoute('/admin/api-keys')({
  component: AdminApiKeysPage,
})

function AdminApiKeysPage() {
  return <AdminApiKeys />
}
