import { createFileRoute } from '@tanstack/react-router';
import ConfigureService from '@/pages/configure-service/ConfigureService';

interface ConfigureSearch {
  tool?: string;
}

export const Route = createFileRoute('/services/$id/')({
  validateSearch: (search: Record<string, unknown>): ConfigureSearch => ({
    tool: typeof search.tool === 'string' ? search.tool : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { tool } = Route.useSearch();
  return <ConfigureService serverId={id} selectedTool={tool} />;
}
