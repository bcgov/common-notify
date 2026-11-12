import { createFileRoute, redirect } from '@tanstack/react-router'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'
import McpServers from '@/pages/admin/McpServers'

export const Route = createFileRoute('/admin/mcp-servers')({
  beforeLoad: () => {
    if (!UserService.hasRole(SsoRole.NOTIFY_ADMIN)) throw redirect({ to: '/not-authorized' })
  },
  component: McpServers,
})
