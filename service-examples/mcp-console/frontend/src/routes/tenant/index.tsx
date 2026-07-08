import { createFileRoute } from '@tanstack/react-router';
import TenantServiceList from '@/pages/tenant-service-list/TenantServiceList';

interface TenantSearch {
  tenant?: string;
}

export const Route = createFileRoute('/tenant/')({
  validateSearch: (search: Record<string, unknown>): TenantSearch => ({
    tenant: typeof search.tenant === 'string' ? search.tenant : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { tenant } = Route.useSearch();
  return <TenantServiceList tenant={tenant} />;
}
