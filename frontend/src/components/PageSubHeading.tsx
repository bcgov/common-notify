import type { FC } from 'react'

interface PageSubHeadingProps {
  title: string
  /** For a section that names itself by this heading with aria-labelledby. */
  id?: string
}

/**
 * PageSubHeading Component
 * Standardized page sub heading component for consistent styling across all pages
 */
const PageSubHeading: FC<PageSubHeadingProps> = ({ title, id }) => {
  return (
    <h2 className="page__section-heading" id={id}>
      {title}
    </h2>
  )
}

export default PageSubHeading
