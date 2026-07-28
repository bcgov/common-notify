import type { FC } from 'react'

interface PageHeadingProps {
  title: string
}

/**
 * PageHeading Component
 * Standardized page heading component for consistent styling across all pages
 */
const PageHeading: FC<PageHeadingProps> = ({ title }) => {
  return <h1 className="page-heading">{title}</h1>
}

export default PageHeading
