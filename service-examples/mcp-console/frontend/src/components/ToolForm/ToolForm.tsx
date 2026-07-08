import type { FC } from 'react';
import { useMemo, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import type { ToolCallResult, ToolInfo } from '@/api/mcpConsole.api';
import JsonSchemaField from './JsonSchemaField';
import { schemaToFields, type FieldSpec } from './schema-to-fields';

interface ToolFormProps {
  tool: ToolInfo;
  onExecute: (args: Record<string, unknown>) => Promise<ToolCallResult>;
  /** Pre-fill values keyed by parameter name — already-saved defaults (global+tenant merged as appropriate by the caller). */
  initialValues?: Record<string, unknown>;
  /** Parameter names that cannot be edited on this form (already locked by the global admin). */
  lockedFields?: Set<string>;
  /** Omit to hide the "Save defaults" action entirely (not every context needs it). */
  onSaveDefaults?: (values: Record<string, unknown>) => Promise<void>;
  saveButtonLabel?: string;
}

function seedValue(field: FieldSpec, initialValues?: Record<string, unknown>): string {
  if (initialValues && field.name in initialValues) {
    return stringifyValue(field, initialValues[field.name]);
  }
  if (field.kind === 'json') return field.rawType === 'object' ? '{}' : '[]';
  if (field.kind === 'boolean') return 'false';
  return '';
}

function stringifyValue(field: FieldSpec, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (field.kind === 'json') return JSON.stringify(value);
  return String(value);
}

/** Converts a field's raw string form value into the JS value expected by the tool's inputSchema. */
function coerceValue(field: FieldSpec, raw: string): unknown {
  switch (field.kind) {
    case 'number':
      return raw === '' ? undefined : Number(raw);
    case 'boolean':
      return raw === 'true';
    case 'json':
      return raw.trim() === '' ? undefined : JSON.parse(raw);
    default:
      return raw === '' ? undefined : raw;
  }
}

/** Whether a raw form value represents "nothing entered" for save-defaults purposes (skips the seeded '[]'/'{}' placeholders). */
function isBlank(field: FieldSpec, raw: string): boolean {
  if (field.kind === 'json') return raw.trim() === '' || raw.trim() === '[]' || raw.trim() === '{}';
  return raw.trim() === '';
}

const ToolForm: FC<ToolFormProps> = ({
  tool,
  onExecute,
  initialValues,
  lockedFields,
  onSaveDefaults,
  saveButtonLabel = 'Save defaults',
}) => {
  const { required, optional, previewField } = useMemo(() => schemaToFields(tool.inputSchema), [tool]);
  const allFields = useMemo(
    () => [...required, ...optional, ...(previewField ? [previewField] : [])],
    [required, optional, previewField],
  );

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(allFields.map((field) => [field.name, seedValue(field, initialValues)])),
  );
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ToolCallResult | null>(null);

  const isLocked = (name: string) => lockedFields?.has(name) ?? false;

  const setFieldValue = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const buildArgs = ({ enforceRequired }: { enforceRequired: boolean }): Record<string, unknown> => {
    const args: Record<string, unknown> = {};
    for (const field of allFields) {
      const raw = values[field.name] ?? '';
      if (enforceRequired && field.required && raw.trim() === '') {
        throw new Error(`"${field.label}" is required`);
      }
      const coerced = coerceValue(field, raw);
      if (coerced !== undefined) args[field.name] = coerced;
    }
    return args;
  };

  const handleRun = async () => {
    setError(null);
    setSaveMessage(null);
    setResult(null);

    let args: Record<string, unknown>;
    try {
      args = buildArgs({ enforceRequired: true });
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
      return;
    }

    setRunning(true);
    try {
      const callResult = await onExecute(args);
      setResult(callResult);
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : String(callError));
    } finally {
      setRunning(false);
    }
  };

  const handleSaveDefaults = async () => {
    if (!onSaveDefaults) return;
    setError(null);
    setSaveMessage(null);

    const toSave: Record<string, unknown> = {};
    try {
      for (const field of allFields) {
        if (isLocked(field.name)) continue;
        const raw = values[field.name] ?? '';
        if (isBlank(field, raw)) continue;
        toSave[field.name] = coerceValue(field, raw);
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
      return;
    }

    setSaving(true);
    try {
      await onSaveDefaults(toSave);
      setSaveMessage('Defaults saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: FieldSpec) => (
    <JsonSchemaField
      key={field.name}
      field={field}
      value={values[field.name] ?? ''}
      onChange={(value) => setFieldValue(field.name, value)}
      locked={isLocked(field.name)}
    />
  );

  return (
    <div>
      <h5>{tool.name}</h5>
      {tool.description && <p className="text-muted">{tool.description}</p>}

      {required.length > 0 && (
        <>
          <h6 className="text-uppercase text-muted mt-4">Required parameters</h6>
          {required.map(renderField)}
        </>
      )}

      {optional.length > 0 && (
        <>
          <h6 className="text-uppercase text-muted mt-4">Optional parameters</h6>
          {optional.map(renderField)}
        </>
      )}

      {previewField && <div className="mt-4">{renderField(previewField)}</div>}

      <div className="d-flex gap-2 mt-3">
        <Button onClick={handleRun} disabled={running}>
          {running ? 'Running…' : 'Test'}
        </Button>
        {onSaveDefaults && (
          <Button variant="outline-primary" onClick={handleSaveDefaults} disabled={saving}>
            {saving ? 'Saving…' : saveButtonLabel}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}

      {saveMessage && (
        <Alert variant="success" className="mt-3">
          {saveMessage}
        </Alert>
      )}

      {result && (
        <div className="mt-3">
          <h6 className="text-uppercase text-muted">Result</h6>
          <div className={`tool-result-panel ${result.isError ? 'tool-result-panel--error' : ''}`}>
            {JSON.stringify(result.structuredContent ?? result.content, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolForm;
