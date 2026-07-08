import type { FC, ReactNode } from 'react';
import { Form } from 'react-bootstrap';

interface TextFieldProps {
  label: ReactNode;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  type?: 'text' | 'url' | 'number';
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  maxLength?: number;
}

/** Required-asterisk convention adapted from common-notify/frontend's InputWrappers/TextField.tsx. */
const TextField: FC<TextFieldProps> = ({
  label,
  description,
  required,
  disabled,
  type = 'text',
  value,
  onChange,
  min,
  max,
  maxLength,
}) => (
  <Form.Group className="mb-3">
    <Form.Label>
      {label} {required && <span className="required-marker">*</span>}
    </Form.Label>
    <Form.Control
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={min}
      max={max}
      maxLength={maxLength}
      disabled={disabled}
    />
    {description && <Form.Text muted>{description}</Form.Text>}
  </Form.Group>
);

export default TextField;
