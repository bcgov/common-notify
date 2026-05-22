import type { ComponentPropsWithoutRef } from 'react'

export function TableBody({ children, ...props }: ComponentPropsWithoutRef<'tbody'>) {
  return <tbody {...props}>{children}</tbody>
}
