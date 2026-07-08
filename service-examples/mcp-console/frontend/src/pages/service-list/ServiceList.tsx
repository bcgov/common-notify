import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from '@tanstack/react-router';
import Card from '@/components/Card';
import { listServers, type McpServerSummary } from '@/api/mcpConsole.api';
import { categoryLabel } from '@/constants/categories';

const ServiceList: FC = () => {
  const [servers, setServers] = useState<McpServerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listServers()
      .then(setServers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <Card
      title="Registered MCP servers"
      subtitle="Add a server, choose which of its tools to enable, then configure and run them."
    >
      <div className="d-flex justify-content-end mb-3">
        <Link to="/add-service" className="btn btn-primary">
          Add service
        </Link>
      </div>

      {error && <p className="text-danger">{error}</p>}
      {!error && servers === null && <p className="text-muted">Loading…</p>}
      {servers?.length === 0 && <p className="text-muted">No MCP servers registered yet.</p>}

      {servers && servers.length > 0 && (
        <Table hover responsive>
          <thead>
            <tr>
              <th>Short name</th>
              <th>URL</th>
              <th>Transport</th>
              <th>Category</th>
              <th>Enabled tools</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.id}>
                <td>{server.shortName}</td>
                <td className="text-break">{server.url}</td>
                <td>{server.transport}</td>
                <td>{categoryLabel(server.category)}</td>
                <td>{server.enabledTools.length}</td>
                <td className="text-end">
                  <Link
                    to="/services/$id"
                    params={{ id: server.id }}
                    className="btn btn-sm btn-outline-primary"
                  >
                    Configure service
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
};

export default ServiceList;
