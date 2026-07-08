import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Table } from 'react-bootstrap';
import { Link, useNavigate } from '@tanstack/react-router';
import Card from '@/components/Card';
import TextField from '@/components/InputWrappers/TextField';
import Select from '@/components/InputWrappers/Select';
import TestToolModal from '@/components/TestToolModal';
import {
  addTenantService,
  listServers,
  listTenantServices,
  type McpServerSummary,
  type TenantServiceSummary,
} from '@/api/mcpConsole.api';
import { SERVICE_CATEGORIES, categoryLabel } from '@/constants/categories';

const TENANT_STORAGE_KEY = 'mcp-console.tenantName';

interface TenantServiceListProps {
  tenant?: string;
}

const TenantServiceList: FC<TenantServiceListProps> = ({ tenant }) => {
  const navigate = useNavigate();
  const [tenantInput, setTenantInput] = useState(
    () => tenant ?? localStorage.getItem(TENANT_STORAGE_KEY) ?? '',
  );

  const [subscribed, setSubscribed] = useState<TenantServiceSummary[] | null>(null);
  const [allServers, setAllServers] = useState<McpServerSummary[] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<TenantServiceSummary | null>(null);

  const loadSubscribed = (name: string) =>
    listTenantServices(name)
      .then(setSubscribed)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

  useEffect(() => {
    if (!tenant) return;
    localStorage.setItem(TENANT_STORAGE_KEY, tenant);
    setError(null);
    loadSubscribed(tenant);
    listServers()
      .then(setAllServers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const availableToAdd = useMemo(() => {
    if (!allServers) return [];
    const subscribedIds = new Set((subscribed ?? []).map((s) => s.id));
    return allServers
      .filter((server) => !subscribedIds.has(server.id))
      .filter((server) => !categoryFilter || server.category === categoryFilter);
  }, [allServers, subscribed, categoryFilter]);

  const handleGo = () => {
    if (!tenantInput.trim()) return;
    navigate({ to: '/tenant', search: { tenant: tenantInput.trim() } });
  };

  const handleAdd = async (serverId: string) => {
    if (!tenant) return;
    setError(null);
    try {
      await addTenantService(tenant, serverId);
      await loadSubscribed(tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card
      title="Tenant admin"
      subtitle="Add one of the globally registered MCP services, then configure default parameter values for its enabled tools."
    >
      <div className="d-flex gap-2 align-items-end mb-4" style={{ maxWidth: 420 }}>
        <div className="flex-grow-1">
          <TextField label="Tenant name" value={tenantInput} onChange={setTenantInput} />
        </div>
        <Button className="mb-3" onClick={handleGo}>
          Go
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {tenant && (
        <>
          <h6 className="text-uppercase text-muted">
            Services added by <strong>{tenant}</strong>
          </h6>
          {subscribed === null && <p className="text-muted">Loading…</p>}
          {subscribed?.length === 0 && (
            <p className="text-muted">No services added yet — add one below.</p>
          )}
          {subscribed && subscribed.length > 0 && (
            <Table hover responsive className="mb-4">
              <thead>
                <tr>
                  <th>Short name</th>
                  <th>Category</th>
                  <th>Enabled tools</th>
                  <th>Default tool</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {subscribed.map((server) => (
                  <tr key={server.id}>
                    <td>{server.shortName}</td>
                    <td>{categoryLabel(server.category)}</td>
                    <td>{server.enabledTools.length}</td>
                    <td>{server.defaultToolName ?? <span className="text-muted">—</span>}</td>
                    <td className="text-end">
                      <div className="d-flex gap-2 justify-content-end">
                        <Link
                          to="/tenant/services/$id"
                          params={{ id: server.id }}
                          search={{ tenant }}
                          className="btn btn-sm btn-outline-primary"
                        >
                          Configure
                        </Link>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          disabled={!server.defaultToolName}
                          onClick={() => setTestTarget(server)}
                        >
                          Test
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <h6 className="text-uppercase text-muted">Add a service</h6>
          <div className="mb-3" style={{ maxWidth: 320 }}>
            <Select
              label="Filter by category"
              options={[
                { value: '', label: 'All categories' },
                ...SERVICE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
              ]}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>
          {availableToAdd.length === 0 && allServers !== null && (
            <p className="text-muted">
              {allServers.length === 0
                ? 'No MCP servers have been registered by the global admin yet.'
                : 'No available services match this category.'}
            </p>
          )}
          {availableToAdd.length > 0 && (
            <Table hover responsive>
              <thead>
                <tr>
                  <th>Short name</th>
                  <th>Category</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {availableToAdd.map((server) => (
                  <tr key={server.id}>
                    <td>{server.shortName}</td>
                    <td>{categoryLabel(server.category)}</td>
                    <td className="text-end">
                      <Button size="sm" onClick={() => handleAdd(server.id)}>
                        Add
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}

      {tenant && testTarget && (
        <TestToolModal
          show={!!testTarget}
          onHide={() => setTestTarget(null)}
          serverId={testTarget.id}
          toolName={testTarget.defaultToolName ?? ''}
          tenant={tenant}
        />
      )}
    </Card>
  );
};

export default TenantServiceList;
