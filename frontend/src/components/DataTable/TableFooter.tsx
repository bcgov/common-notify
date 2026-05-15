import type { ComponentPropsWithoutRef } from 'react'

export function TableFooter({ children, ...props }: ComponentPropsWithoutRef<'tfoot'>) {
  return <tfoot {...props}>{children}</tfoot>
}
