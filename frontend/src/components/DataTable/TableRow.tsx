import type { ComponentPropsWithoutRef } from 'react'

export function TableRow({ children, ...props }: ComponentPropsWithoutRef<'tr'>) {
  return <tr {...props}>{children}</tr>
}
