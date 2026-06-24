import { createFileRoute, redirect } from '@tanstack/react-router'
import FeatureFlagAdmin from '@/components/FeatureFlagAdmin'
import UserService, { UserRole } from '@/service/user-service'

export const Route = createFileRoute('/admin/feature-flags')({
  beforeLoad: () => {
    if (!UserService.hasRole(UserRole.NOTIFY_ADMIN)) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: FeatureFlagsPage,
})

function FeatureFlagsPage() {
  return <FeatureFlagAdmin />
}
