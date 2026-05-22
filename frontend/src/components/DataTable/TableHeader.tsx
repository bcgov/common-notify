import type { ComponentPropsWithoutRef } from 'react'

export function TableHeader({ children, ...props }: ComponentPropsWithoutRef<'thead'>) {
  return <thead {...props}>{children}</thead>
}
