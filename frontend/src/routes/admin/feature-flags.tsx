import { createFileRoute, redirect } from '@tanstack/react-router'
import FeatureFlagAdmin from '@/components/FeatureFlagAdmin'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'

export const Route = createFileRoute('/admin/feature-flags')({
  beforeLoad: () => {
    if (!UserService.hasRole(SsoRole.NOTIFY_ADMIN)) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: FeatureFlagsPage,
})

function FeatureFlagsPage() {
  return <FeatureFlagAdmin />
}
