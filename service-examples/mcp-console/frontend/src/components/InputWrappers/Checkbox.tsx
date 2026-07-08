import type { FC } from 'react';
import { Form } from 'react-bootstrap';

interface CheckboxProps {
  label: string;
  description?: string;
  disabled?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const Checkbox: FC<CheckboxProps> = ({ label, description, disabled, checked, onChange }) => (
  <Form.Group className="mb-3">
    <Form.Check
      type="checkbox"
      label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    {description && <Form.Text muted>{description}</Form.Text>}
  </Form.Group>
);

export default Checkbox;
