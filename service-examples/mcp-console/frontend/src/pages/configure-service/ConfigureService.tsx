import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Button, Col, ListGroup, Row } from 'react-bootstrap';
import { Link, useNavigate } from '@tanstack/react-router';
import Card from '@/components/Card';
import Checkbox from '@/components/InputWrappers/Checkbox';
import ToolForm from '@/components/ToolForm/ToolForm';
import {
  executeTool,
  getServer,
  getToolDefaults,
  listAllServerTools,
  listServerTools,
  saveToolDefaults,
  updateEnabledTools,
  type McpServerSummary,
  type ToolDefaults,
  type ToolInfo,
} from '@/api/mcpConsole.api';

interface ConfigureServiceProps {
  serverId: string;
  selectedTool?: string;
}

const ConfigureService: FC<ConfigureServiceProps> = ({ serverId, selectedTool }) => {
  const navigate = useNavigate();
  const [server, setServer] = useState<McpServerSummary | null>(null);
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [defaults, setDefaults] = useState<ToolDefaults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingTools, setEditingTools] = useState(false);
  const [allTools, setAllTools] = useState<ToolInfo[] | null>(null);
  const [pendingEnabled, setPendingEnabled] = useState<Set<string>>(new Set());
  const [savingTools, setSavingTools] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    return Promise.all([getServer(serverId), listServerTools(serverId)])
      .then(([serverSummary, toolList]) => {
        setServer(serverSummary);
        setTools(toolList);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const activeTool = tools?.find((tool) => tool.name === selectedTool) ?? null;

  useEffect(() => {
    if (!activeTool) {
      setDefaults(null);
      return;
    }
    let cancelled = false;
    setDefaults(null);
    getToolDefaults(serverId, activeTool.name).then((result) => {
      if (!cancelled) setDefaults(result);
    });
    return () => {
      cancelled = true;
    };
  }, [serverId, activeTool]);

  const startEditingTools = () => {
    setToolsError(null);
    setEditingTools(true);
    setPendingEnabled(new Set(server?.enabledTools ?? []));
    if (!allTools) {
      listAllServerTools(serverId)
        .then(setAllTools)
        .catch((err) => setToolsError(err instanceof Error ? err.message : String(err)));
    }
  };

  const toggleTool = (name: string, checked: boolean) =>
    setPendingEnabled((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });

  const saveEnabledTools = async () => {
    setToolsError(null);
    setSavingTools(true);
    try {
      await updateEnabledTools(serverId, Array.from(pendingEnabled));
      await load();
      setEditingTools(false);
    } catch (err) {
      setToolsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTools(false);
    }
  };

  return (
    <Card title={server ? `Configure: ${server.shortName}` : 'Configure service'}>
      <Link to="/" className="d-inline-block mb-3">
        &larr; Back to registered services
      </Link>
      <p className="text-muted">
        Global admin view — enabled tools and any saved defaults here become the locked floor
        tenant admins cannot override.
      </p>
      {error && <p className="text-danger">{error}</p>}

      {server && !editingTools && (
        <Button variant="outline-secondary" size="sm" className="mb-3" onClick={startEditingTools}>
          Edit enabled tools
        </Button>
      )}

      {editingTools && (
        <Card className="mb-4" title="Edit enabled tools">
          {toolsError && <p className="text-danger">{toolsError}</p>}
          {!toolsError && !allTools && <p className="text-muted">Loading the server's full tool list…</p>}
          {allTools && (
            <>
              {allTools.map((tool) => (
                <Checkbox
                  key={tool.name}
                  label={tool.name}
                  description={tool.description}
                  checked={pendingEnabled.has(tool.name)}
                  onChange={(checked) => toggleTool(tool.name, checked)}
                />
              ))}
              <div className="d-flex gap-2 mt-3">
                <Button
                  variant="outline-secondary"
                  onClick={() => setEditingTools(false)}
                  disabled={savingTools}
                >
                  Cancel
                </Button>
                <Button onClick={saveEnabledTools} disabled={savingTools}>
                  {savingTools ? 'Saving…' : 'Save enabled tools'}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {!editingTools && !error && tools === null && <p className="text-muted">Loading tools…</p>}
      {!editingTools && tools?.length === 0 && (
        <p className="text-muted">
          This service has no enabled tools — click "Edit enabled tools" above to enable some.
        </p>
      )}

      {!editingTools && tools && tools.length > 0 && (
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
                      to: '/services/$id',
                      params: { id: serverId },
                      search: { tool: tool.name },
                    })
                  }
                >
                  <div className="fw-bold">{tool.name}</div>
                  {tool.description && <small className="text-muted">{tool.description}</small>}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Col>
          <Col md={8}>
            {!activeTool && <p className="text-muted">Select a tool to configure its parameters.</p>}
            {activeTool && !defaults && <p className="text-muted">Loading saved defaults…</p>}
            {activeTool && defaults && (
              <ToolForm
                key={activeTool.name}
                tool={activeTool}
                initialValues={defaults.global}
                onExecute={(args) => executeTool(serverId, activeTool.name, args)}
                onSaveDefaults={(values) =>
                  saveToolDefaults(serverId, activeTool.name, { scope: 'global', values }).then(
                    () => undefined,
                  )
                }
                saveButtonLabel="Save as global default"
              />
            )}
          </Col>
        </Row>
      )}
    </Card>
  );
};

export default ConfigureService;
