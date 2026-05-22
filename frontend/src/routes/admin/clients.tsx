import { createFileRoute } from '@tanstack/react-router'
import AdminClients from '@/pages/admin/AdminClients'

export const Route = createFileRoute('/admin/clients')({
  component: AdminClientsPage,
})

function AdminClientsPage() {
  return <AdminClients />
}
