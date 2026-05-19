import type { ComponentPropsWithoutRef } from 'react'

export function TableCell({ children, ...props }: ComponentPropsWithoutRef<'td'>) {
  return <td {...props}>{children}</td>
}
