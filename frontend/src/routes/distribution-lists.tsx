import DistributionLists from '@/pages/distribution-lists/DistributionLists'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/distribution-lists')({
  component: RouteComponent,
})

function RouteComponent() {
  return <DistributionLists />
}
