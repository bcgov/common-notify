import type { FC } from 'react'
import { Button } from 'react-bootstrap'

const MAX_VISIBLE_PAGES_WITHOUT_ELLIPSIS = 7

interface PaginationControlsProps {
  page: number
  totalPages: number
  count: number
  limit: number
  isLoading?: boolean
  onPageChange: (page: number) => void
  className?: string
}

const buildVisiblePages = (currentPage: number, totalPages: number) => {
  if (totalPages <= MAX_VISIBLE_PAGES_WITHOUT_ELLIPSIS) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pageSet = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const pages = [...pageSet]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((firstPage, secondPage) => firstPage - secondPage)

  const items: Array<number | 'ellipsis'> = []

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const previousPage = pages[index - 1]

    if (previousPage !== undefined) {
      const gap = page - previousPage

      if (gap === 2) {
        items.push(previousPage + 1)
      } else if (gap > 2) {
        items.push('ellipsis')
      }
    }

    items.push(page)
  }

  return items
}

const PaginationControls: FC<PaginationControlsProps> = ({
  page,
  totalPages,
  count,
  limit,
  isLoading = false,
  onPageChange,
  className = '',
}) => {
  const shouldShowPagination = count > 0 && limit > 0 && totalPages > 0 && count > limit

  if (!shouldShowPagination) {
    return null
  }

  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const visiblePages = buildVisiblePages(currentPage, totalPages)
  const isPreviousDisabled = currentPage <= 1 || isLoading
  const isNextDisabled = currentPage >= totalPages || count === 0 || isLoading

  return (
    <nav aria-label="Pagination" className={`pagination-controls ${className}`.trim()}>
      <div className="pagination-controls__items">
        <Button
          className="pagination-controls__nav-button"
          variant="outline-secondary"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={isPreviousDisabled}
          type="button"
        >
          <i className="bi bi-chevron-left pagination-controls__nav-icon" aria-hidden="true" />
          Prev
        </Button>
        {visiblePages.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="pagination-controls__ellipsis"
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <Button
              key={item}
              className="pagination-controls__page-button"
              variant={item === currentPage ? 'secondary' : 'outline-secondary'}
              active={item === currentPage}
              aria-current={item === currentPage ? 'page' : undefined}
              disabled={isLoading || item === currentPage}
              onClick={() => onPageChange(item)}
              type="button"
            >
              {item}
            </Button>
          ),
        )}
        <Button
          className="pagination-controls__nav-button"
          variant="outline-secondary"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={isNextDisabled}
          type="button"
        >
          Next
          <i className="bi bi-chevron-right pagination-controls__nav-icon" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}

export default PaginationControls
