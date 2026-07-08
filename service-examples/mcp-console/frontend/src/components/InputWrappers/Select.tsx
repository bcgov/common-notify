import type { FC, ReactNode } from 'react';
import { Form } from 'react-bootstrap';

type SelectOption = string | { value: string; label: string };

interface SelectProps {
  label: ReactNode;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

function normalize(option: SelectOption): { value: string; label: string } {
  return typeof option === 'string' ? { value: option, label: option } : option;
}

const Select: FC<SelectProps> = ({
  label,
  description,
  required,
  disabled,
  options,
  value,
  onChange,
}) => (
  <Form.Group className="mb-3">
    <Form.Label>
      {label} {required && <span className="required-marker">*</span>}
    </Form.Label>
    <Form.Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="" disabled>
        Select…
      </option>
      {options.map(normalize).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Form.Select>
    {description && <Form.Text muted>{description}</Form.Text>}
  </Form.Group>
);

export default Select;
