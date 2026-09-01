import type { FC, ReactNode } from 'react'
import Breadcrumb from './Breadcrumb'
import type { BreadcrumbItem } from './Breadcrumb'

interface PageHeadingProps {
  title: string
  /** Trail shown above the title. Omit on top-level pages, which have no trail. */
  breadcrumbs?: BreadcrumbItem[]
  /** Secondary line under the title, e.g. "Request ID: ...". */
  meta?: ReactNode
}

/**
 * PageHeading Component
 * The heading block every page starts with: an optional breadcrumb, the page
 * title, and an optional meta line. Spacing lives in page.scss so headings sit
 * in the same place on every page.
 */
const PageHeading: FC<PageHeadingProps> = ({ title, breadcrumbs, meta }) => {
  return (
    <header className="page-header">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      <div className="page-header__titles">
        <h1 className="page-heading">{title}</h1>
        {meta != null && <p className="page-header__meta">{meta}</p>}
      </div>
    </header>
  )
}

export default PageHeading
