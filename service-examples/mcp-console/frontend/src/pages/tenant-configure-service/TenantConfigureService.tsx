import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Badge, Button, Col, ListGroup, Row } from 'react-bootstrap';
import { Link, useNavigate } from '@tanstack/react-router';
import Card from '@/components/Card';
import ToolForm from '@/components/ToolForm/ToolForm';
import {
  executeTool,
  getServer,
  getToolDefaults,
  listServerTools,
  listTenantServices,
  saveToolDefaults,
  setDefaultTool,
  type McpServerSummary,
  type ToolDefaults,
  type ToolInfo,
} from '@/api/mcpConsole.api';

interface TenantConfigureServiceProps {
  serverId: string;
  tenant: string;
  selectedTool?: string;
}

const TenantConfigureService: FC<TenantConfigureServiceProps> = ({
  serverId,
  tenant,
  selectedTool,
}) => {
  const navigate = useNavigate();
  const [server, setServer] = useState<McpServerSummary | null>(null);
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [defaults, setDefaults] = useState<ToolDefaults | null>(null);
  const [defaultToolName, setDefaultToolName] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDefaultToolName = () =>
    listTenantServices(tenant).then((services) => {
      setDefaultToolName(services.find((service) => service.id === serverId)?.defaultToolName ?? null);
    });

  useEffect(() => {
    setError(null);
    Promise.all([getServer(serverId), listServerTools(serverId), loadDefaultToolName()])
      .then(([serverSummary, toolList]) => {
        setServer(serverSummary);
        setTools(toolList);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, tenant]);

  const activeTool = tools?.find((tool) => tool.name === selectedTool) ?? null;

  useEffect(() => {
    if (!activeTool) {
      setDefaults(null);
      return;
    }
    let cancelled = false;
    setDefaults(null);
    getToolDefaults(serverId, activeTool.name, tenant).then((result) => {
      if (!cancelled) setDefaults(result);
    });
    return () => {
      cancelled = true;
    };
  }, [serverId, activeTool, tenant]);

  const handleSetDefault = async () => {
    if (!activeTool) return;
    setError(null);
    setSettingDefault(true);
    try {
      await setDefaultTool(tenant, serverId, activeTool.name);
      setDefaultToolName(activeTool.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingDefault(false);
    }
  };

  return (
    <Card title={server ? `Configure: ${server.shortName}` : 'Configure service'}>
      <Link to="/tenant" search={{ tenant }} className="d-inline-block mb-3">
        &larr; Back to {tenant}'s services
      </Link>
      <p className="text-muted">
        Tenant admin view for <strong>{tenant}</strong> — fields marked "Locked by global admin"
        were already set by the global admin and can't be changed here. Exactly one tool can be
        this tenant's default.
      </p>
      {error && <p className="text-danger">{error}</p>}
      {!error && tools === null && <p className="text-muted">Loading tools…</p>}
      {tools?.length === 0 && <p className="text-muted">This service has no enabled tools.</p>}

      {tools && tools.length > 0 && (
        <Row>
          <Col md={4}>
            <ListGroup>
              {tools.map((tool) => (
                <ListGroup.Item
                  key={tool.name}
                  action
                  active={tool.name === selectedTool}
                  onClick={() =>
                    navigate({
                      to: '/tenant/services/$id',
                      params: { id: serverId },
                      search: { tenant, tool: tool.name },
                    })
                  }
                >
                  <div className="fw-bold">
                    {tool.name}
                    {tool.name === defaultToolName && (
                      <Badge bg="success" className="ms-2">
                        Default
                      </Badge>
                    )}
                  </div>
                  {tool.description && <small className="text-muted">{tool.description}</small>}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Col>
          <Col md={8}>
            {!activeTool && <p className="text-muted">Select a tool to configure its parameters.</p>}
            {activeTool && (
              <div className="mb-3">
                {activeTool.name === defaultToolName ? (
                  <Badge bg="success">This is the default tool</Badge>
                ) : (
                  <Button
                    variant="outline-success"
                    size="sm"
                    onClick={handleSetDefault}
                    disabled={settingDefault}
                  >
                    {settingDefault ? 'Setting…' : 'Set as default tool'}
                  </Button>
                )}
              </div>
            )}
            {activeTool && !defaults && <p className="text-muted">Loading saved defaults…</p>}
            {activeTool && defaults && (
              <ToolForm
                key={activeTool.name}
                tool={activeTool}
                initialValues={{ ...defaults.tenant, ...defaults.global }}
                lockedFields={new Set(Object.keys(defaults.global))}
                onExecute={(args) => executeTool(serverId, activeTool.name, args)}
                onSaveDefaults={(values) =>
                  saveToolDefaults(serverId, activeTool.name, {
                    scope: 'tenant',
                    tenantName: tenant,
                    values,
                  }).then(() => undefined)
                }
                saveButtonLabel="Save my defaults"
              />
            )}
          </Col>
        </Row>
      )}
    </Card>
  );
};

export default TenantConfigureService;
