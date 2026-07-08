import type { FC } from 'react';
import { useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { useNavigate } from '@tanstack/react-router';
import Card from '@/components/Card';
import TextField from '@/components/InputWrappers/TextField';
import Select from '@/components/InputWrappers/Select';
import Checkbox from '@/components/InputWrappers/Checkbox';
import { createServer, discoverTools, type McpTransport, type ToolInfo } from '@/api/mcpConsole.api';
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/constants/categories';

const AddService: FC = () => {
  const navigate = useNavigate();

  const [shortName, setShortName] = useState('');
  const [url, setUrl] = useState('');
  const [transport, setTransport] = useState<McpTransport>('streamable-http');
  const [category, setCategory] = useState<ServiceCategory>('msgApp');
  const [apiKey, setApiKey] = useState('');

  const [discovering, setDiscovering] = useState(false);
  const [discoveredTools, setDiscoveredTools] = useState<ToolInfo[] | null>(null);
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDiscover = async () => {
    setError(null);
    setDiscovering(true);
    try {
      const tools = await discoverTools({ url, transport, apiKey });
      setDiscoveredTools(tools);
      setEnabledTools(new Set(tools.map((tool) => tool.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  };

  const toggleTool = (name: string, checked: boolean) =>
    setEnabledTools((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const server = await createServer({
        shortName,
        url,
        transport,
        category,
        apiKey,
        enabledTools: Array.from(enabledTools),
      });
      navigate({ to: '/services/$id', params: { id: server.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Add service" subtitle="Step 1: connect to the MCP server and discover its tools">
      {error && <Alert variant="danger">{error}</Alert>}

      {!discoveredTools && (
        <>
          <TextField label="Short name" required value={shortName} onChange={setShortName} />
          <TextField
            label="URL"
            required
            type="url"
            description="e.g. http://localhost:8811/sse or http://127.0.0.1:6277/mcp"
            value={url}
            onChange={setUrl}
          />
          <Select
            label="Transport"
            required
            options={['streamable-http', 'sse']}
            value={transport}
            onChange={(value) => setTransport(value as McpTransport)}
          />
          <Select
            label="Category"
            required
            options={SERVICE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            value={category}
            onChange={(value) => setCategory(value as ServiceCategory)}
          />
          <TextField
            label="API key"
            required
            description="Sent as an Authorization: Bearer header. Stored encrypted."
            value={apiKey}
            onChange={setApiKey}
          />
          <Button
            onClick={handleDiscover}
            disabled={discovering || !shortName || !url || !apiKey}
          >
            {discovering ? 'Connecting…' : 'Discover tools'}
          </Button>
        </>
      )}

      {discoveredTools && (
        <>
          <p className="text-muted">
            Step 2: choose which of the {discoveredTools.length} discovered tools to enable for{' '}
            <strong>{shortName}</strong>.
          </p>
          {discoveredTools.map((tool) => (
            <Checkbox
              key={tool.name}
              label={tool.name}
              description={tool.description}
              checked={enabledTools.has(tool.name)}
              onChange={(checked) => toggleTool(tool.name, checked)}
            />
          ))}
          <div className="d-flex gap-2 mt-3">
            <Button variant="outline-secondary" onClick={() => setDiscoveredTools(null)}>
              Back
            </Button>
            <Button onClick={handleSave} disabled={saving || enabledTools.size === 0}>
              {saving ? 'Saving…' : 'Save service'}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};

export default AddService;
