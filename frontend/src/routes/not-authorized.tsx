import { createFileRoute } from '@tanstack/react-router'
import NotAuthorized from '@/components/NotAuthorized'
import config from '@/config'

export const Route = createFileRoute('/not-authorized')({
  component: RouteComponent,
})

function RouteComponent() {
  const cstarUrl = config.CSTAR_TENANT_SETUP_URL
  return <NotAuthorized cstarUrl={cstarUrl} />
}
