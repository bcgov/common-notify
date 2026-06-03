import { createFileRoute } from '@tanstack/react-router'
import NotAuthorized from '@/components/NotAuthorized'

export const Route = createFileRoute('/not-authorized')({
  component: RouteComponent,
})

function RouteComponent() {
  const cstarUrl = import.meta.env.VITE_CSTAR_API_URL
  return <NotAuthorized cstarUrl={cstarUrl} />
}
