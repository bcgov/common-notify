import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Modal } from 'react-bootstrap';
import ToolForm from '@/components/ToolForm/ToolForm';
import {
  executeTool,
  getToolDefaults,
  listServerTools,
  saveToolDefaults,
  type ToolDefaults,
  type ToolInfo,
} from '@/api/mcpConsole.api';

interface TestToolModalProps {
  show: boolean;
  onHide: () => void;
  serverId: string;
  toolName: string;
  tenant: string;
}

/**
 * Same tool form + Test behaviour as the Configure page, in a modal — for the tenant's
 * quick-access "Test" button on the service list, which always targets the default tool.
 */
const TestToolModal: FC<TestToolModalProps> = ({ show, onHide, serverId, toolName, tenant }) => {
  const [tool, setTool] = useState<ToolInfo | null>(null);
  const [defaults, setDefaults] = useState<ToolDefaults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    setTool(null);
    setDefaults(null);
    setError(null);
    Promise.all([listServerTools(serverId), getToolDefaults(serverId, toolName, tenant)])
      .then(([tools, toolDefaults]) => {
        const found = tools.find((t) => t.name === toolName);
        if (!found) {
          setError(`"${toolName}" is no longer an enabled tool for this service.`);
          return;
        }
        setTool(found);
        setDefaults(toolDefaults);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [show, serverId, toolName, tenant]);

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Test: {toolName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <p className="text-danger">{error}</p>}
        {!error && (!tool || !defaults) && <p className="text-muted">Loading…</p>}
        {tool && defaults && (
          <ToolForm
            tool={tool}
            initialValues={{ ...defaults.tenant, ...defaults.global }}
            lockedFields={new Set(Object.keys(defaults.global))}
            onExecute={(args) => executeTool(serverId, toolName, args)}
            onSaveDefaults={(values) =>
              saveToolDefaults(serverId, toolName, {
                scope: 'tenant',
                tenantName: tenant,
                values,
              }).then(() => undefined)
            }
            saveButtonLabel="Save my defaults"
          />
        )}
      </Modal.Body>
    </Modal>
  );
};

export default TestToolModal;
