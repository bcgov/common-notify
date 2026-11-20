import { createFileRoute } from '@tanstack/react-router'
import AdminSmsNumbers from '@/pages/admin/sms-numbers/AdminSmsNumbers'

export const Route = createFileRoute('/admin/sms-numbers')({
  component: AdminSmsNumbers,
})
