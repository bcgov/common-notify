import type { CSSProperties } from 'react'
import React from 'react'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  title?: string
  style?: CSSProperties
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  title,
  style = {},
}) => {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      style={{
        width: '2.5rem',
        height: '1.25rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        accentColor: '#28a745',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    />
  )
}
