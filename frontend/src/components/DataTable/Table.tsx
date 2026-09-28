import type { ComponentPropsWithoutRef } from 'react'
import '@/scss/components/data-table.scss'

export interface TableProps extends ComponentPropsWithoutRef<'table'> {
  variant?: 'striped' | 'bordered' | 'plain'
  size?: 'sm' | 'md' | 'lg'
  scrollable?: boolean
  /** Stack-friendly rows: cells top-align and wrap. For tables whose cells hold more than a value. */
  multiline?: boolean
}

export function Table({
  variant = 'plain',
  size = 'md',
  scrollable = false,
  multiline = false,
  className = '',
  children,
  ...props
}: TableProps) {
  const tableClass = [
    'data-table',
    `data-table--${variant}`,
    `data-table--${size}`,
    multiline && 'data-table--multiline',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={scrollable ? 'data-table-wrapper' : undefined}>
      <table className={tableClass} {...props}>
        {children}
      </table>
    </div>
  )
}
