import { createFileRoute } from '@tanstack/react-router'
import RequestStatus from '@/pages/request-status/RequestStatus'

export const Route = createFileRoute('/request-status/$notificationRequestId')({
  component: RequestStatusPage,
})

function RequestStatusPage() {
  const params = Route.useParams()
  return <RequestStatus notificationRequestId={params.notificationRequestId} />
}
