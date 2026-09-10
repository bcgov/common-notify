import type { FC } from 'react'

interface PageSubHeadingProps {
  title: string
}

/**
 * PageSubHeading Component
 * Standardized page sub heading component for consistent styling across all pages
 */
const PageSubHeading: FC<PageSubHeadingProps> = ({ title }) => {
  return <h2 className="page__section-heading">{title}</h2>
}

export default PageSubHeading
