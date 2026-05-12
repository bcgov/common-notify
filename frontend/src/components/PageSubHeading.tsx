import type { FC } from 'react'

interface PageSubHeadingProps {
  title: string
}

/**
 * PageSubHeading Component
 * Standardized page sub heading component for consistent styling across all pages
 */
const PageSubHeading: FC<PageSubHeadingProps> = ({ title }) => {
  return (
    <div className="d-flex align-items-center justify-content-between mb-4">
      <h2 className="fw-bold mb-0 fs-5">{title}</h2>
    </div>
  )
}

export default PageSubHeading
