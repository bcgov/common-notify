import type { FC } from 'react'
import { TextField as BCGovTextField } from '@bcgov/design-system-react-components'

interface WrappedTextFieldProps {
  label: string
  placeholder?: string
  required?: boolean
  value?: string
  onChange?: (value: string) => void
  maxLength?: number
  description?: string
  [key: string]: any
}

/**
 * TextField wrapper that automatically adds "*" to the label when required is true
 */
const TextField: FC<WrappedTextFieldProps> = ({ label, required, ...props }) => {
  const displayLabel = required ? (
    <>
      {label} <span className="text-danger">*</span>
    </>
  ) : (
    label
  )

  return <BCGovTextField {...(props as any)} label={displayLabel as any} />
}

export default TextField
