import type { FC } from 'react'

interface PageHeadingProps {
  title: string
}

/**
 * PageHeading Component
 * Standardized page heading component for consistent styling across all pages
 */
const PageHeading: FC<PageHeadingProps> = ({ title }) => {
  return (
    <div className="d-flex align-items-center justify-content-between mb-4">
      <h1 className="fw-bold mb-0">{title}</h1>
    </div>
  )
}

export default PageHeading
