import { createFileRoute, redirect } from '@tanstack/react-router'
import Settings from '@/pages/settings/Settings'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'

export const Route = createFileRoute('/admin/settings')({
  beforeLoad: () => {
    if (!UserService.hasRole(SsoRole.NOTIFY_ADMIN)) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: SettingsPage,
})

function SettingsPage() {
  return <Settings />
}
