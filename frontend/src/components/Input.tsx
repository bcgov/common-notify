import type { ComponentProps } from 'react'
import { TextField } from '@bcgov/design-system-react-components'

/**
 * Infer exact props from design system component.
 * Ensures we stay aligned with upstream changes.
 */
type TextFieldProps = ComponentProps<typeof TextField>

/**
 * App-level Input API (clean + stable)
 *
 * We intentionally DO NOT expose react-aria concepts:
 * - isDisabled, isFocused, onFocus/onBlur raw events, etc.
 *
 * We normalize everything into familiar web/React conventions.
 */
export interface InputProps extends Omit<
  TextFieldProps,
  'isDisabled' | 'onChange' | 'value' | 'children'
> {
  /** Standard HTML-style disabled prop (normalized) */
  disabled?: boolean

  /** Input value */
  value?: string

  /** Change handler (normalized - receives string directly) */
  onChange?: (value: string) => void

  /** Optional label text */
  label?: string

  /** Optional error message */
  errorMessage?: string

  /** Optional helper text below input */
  description?: string
}

/**
 * Production-safe Input wrapper
 *
 * Responsibilities:
 * - Normalize API (disabled → isDisabled, onChange receives string)
 * - Keep design system behavior intact
 * - Prevent leaking internal react-aria APIs
 */
export function Input({
  disabled,
  value,
  onChange,
  label,
  errorMessage,
  description,
  ...rest
}: InputProps) {
  return (
    <TextField
      {...rest}
      isDisabled={disabled}
      value={value}
      onChange={onChange}
      label={label}
      errorMessage={errorMessage}
      description={description}
    />
  )
}

export default Input
