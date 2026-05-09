import type { FC } from 'react'
import { Select as BCGovSelect } from '@bcgov/design-system-react-components'

interface WrappedSelectProps {
  label: string
  placeholder?: string
  required?: boolean
  items?: { id?: string; label?: string; [key: string]: any }[]
  value?: string | string[]
  onChange?: (value: any) => void
  multiple?: boolean
  style?: React.CSSProperties
  description?: string
  [key: string]: any
}

/**
 * Select wrapper that automatically adds "*" to the label when required is true
 */
const Select: FC<WrappedSelectProps> = ({ label, required, ...props }) => {
  const displayLabel = required ? (
    <>
      {label} <span className="text-danger">*</span>
    </>
  ) : (
    label
  )

  return <BCGovSelect {...(props as any)} label={displayLabel as any} />
}

export default Select
