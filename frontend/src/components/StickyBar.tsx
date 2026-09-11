import type { FC, ReactNode } from 'react'
import '@/scss/components/sticky-bar.scss'

type StickyBarProps = {
  children: ReactNode
}

// Holds a form's action buttons and keeps them pinned to the bottom of the viewport
// while the form it sits in is scrolled.
const StickyBar: FC<StickyBarProps> = ({ children }) => <div className="sticky-bar">{children}</div>

export default StickyBar
