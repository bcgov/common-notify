import type { ComponentPropsWithoutRef } from 'react'

type BootstrapIconProps = ComponentPropsWithoutRef<'i'> & {
  name: string
  fontSize?: 'small' | 'medium' | 'large' | 'inherit'
}

const sizes = { small: 20, medium: 24, large: 35, inherit: 'inherit' } as const

/** Decorative icons use the Bootstrap icon font already loaded by styles.scss. */
export function BootstrapIcon({
  name,
  fontSize = 'medium',
  className = '',
  style,
  ...props
}: BootstrapIconProps) {
  return (
    <i
      aria-hidden="true"
      {...props}
      className={`bi bi-${name} ${className}`.trim()}
      style={{
        display: 'inline-block',
        width: '1em',
        height: '1em',
        flexShrink: 0,
        lineHeight: 1,
        fontSize: sizes[fontSize],
        ...style,
      }}
    />
  )
}
