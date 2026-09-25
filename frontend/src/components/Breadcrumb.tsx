import { Link } from '@tanstack/react-router'
import type { FC } from 'react'

export type BreadcrumbItem = {
  label: string
  to?: '/dashboard' | '/templates' | '/events' | '/'
}

export type BreadcrumbProps = {
  items: BreadcrumbItem[]
}

const Breadcrumb: FC<BreadcrumbProps> = ({ items }) => (
  <nav aria-label="Breadcrumb">
    <ol className="breadcrumb__list">
      {items.map((item, index) => {
        const isCurrentPage = index === items.length - 1

        return (
          <li className="breadcrumb__item" key={`${item.label}-${index}`}>
            {index > 0 && (
              <span className="breadcrumb__separator" aria-hidden="true">
                /
              </span>
            )}
            {isCurrentPage ? (
              <span className="breadcrumb__current" aria-current="page">
                {item.label}
              </span>
            ) : item.to ? (
              <Link className="breadcrumb__link" to={item.to}>
                {item.label}
              </Link>
            ) : (
              <span className="breadcrumb__link">{item.label}</span>
            )}
          </li>
        )
      })}
    </ol>
  </nav>
)

export default Breadcrumb
