import { createFileRoute } from '@tanstack/react-router'
import DistributionLists from '@/containers/pages/distribution-lists/DistributionLists'

export const Route = createFileRoute('/distribution-lists')({
  component: DistributionListsPage,
})

function DistributionListsPage() {
  return <DistributionLists />
}
