import type { FC } from 'react';
import { Badge, Form } from 'react-bootstrap';
import Select from '@/components/InputWrappers/Select';
import TextField from '@/components/InputWrappers/TextField';
import Checkbox from '@/components/InputWrappers/Checkbox';
import type { FieldSpec } from './schema-to-fields';

interface JsonSchemaFieldProps {
  field: FieldSpec;
  value: string;
  onChange: (value: string) => void;
  /** Set when a global admin has already saved a default for this parameter — read-only here. */
  locked?: boolean;
}

const LockedBadge: FC = () => (
  <Badge bg="secondary" className="ms-2">
    Locked by global admin
  </Badge>
);

const JsonSchemaField: FC<JsonSchemaFieldProps> = ({ field, value, onChange, locked }) => {
  const label = locked ? (
    <>
      {field.label}
      <LockedBadge />
    </>
  ) : (
    field.label
  );

  switch (field.kind) {
    case 'select':
      return (
        <Select
          label={label}
          description={field.description}
          required={field.required}
          disabled={locked}
          options={field.enumOptions ?? []}
          value={value}
          onChange={onChange}
        />
      );
    case 'url':
      return (
        <TextField
          label={label}
          description={field.description}
          required={field.required}
          disabled={locked}
          type="url"
          value={value}
          onChange={onChange}
        />
      );
    case 'number':
      return (
        <TextField
          label={label}
          description={field.description}
          required={field.required}
          disabled={locked}
          type="number"
          min={field.minimum}
          max={field.maximum}
          value={value}
          onChange={onChange}
        />
      );
    case 'boolean':
      return (
        <Checkbox
          label={field.label}
          description={field.description}
          disabled={locked}
          checked={value === 'true'}
          onChange={(checked) => onChange(String(checked))}
        />
      );
    case 'json':
      return (
        <Form.Group className="mb-3">
          <Form.Label>
            {field.label} {field.required && <span className="required-marker">*</span>}
            <span className="text-muted"> (raw JSON)</span>
            {locked && <LockedBadge />}
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
          />
          {field.description && <Form.Text muted>{field.description}</Form.Text>}
        </Form.Group>
      );
    case 'text':
    default:
      return (
        <TextField
          label={label}
          description={field.description}
          required={field.required}
          disabled={locked}
          maxLength={field.maxLength}
          value={value}
          onChange={onChange}
        />
      );
  }
};

export default JsonSchemaField;
