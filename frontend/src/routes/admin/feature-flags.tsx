import { createFileRoute } from '@tanstack/react-router'
import FeatureFlagAdmin from '@/components/FeatureFlagAdmin'

export const Route = createFileRoute('/admin/feature-flags')({
  component: FeatureFlagsPage,
})

function FeatureFlagsPage() {
  return <FeatureFlagAdmin />
}
