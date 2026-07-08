import { Navigate, createFileRoute } from '@tanstack/react-router';
import TenantConfigureService from '@/pages/tenant-configure-service/TenantConfigureService';

interface TenantConfigureSearch {
  tenant?: string;
  tool?: string;
}

export const Route = createFileRoute('/tenant/services/$id/')({
  validateSearch: (search: Record<string, unknown>): TenantConfigureSearch => ({
    tenant: typeof search.tenant === 'string' ? search.tenant : undefined,
    tool: typeof search.tool === 'string' ? search.tool : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { tenant, tool } = Route.useSearch();

  if (!tenant) {
    return <Navigate to="/tenant" />;
  }

  return <TenantConfigureService serverId={id} tenant={tenant} selectedTool={tool} />;
}
