import type { FC } from 'react'

interface TablePaginationFooterProps {
  page: number
  totalPages: number
  count: number
  limit: number
  isLoading?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

const TablePaginationFooter: FC<TablePaginationFooterProps> = ({
  page,
  totalPages,
  count,
  limit,
  isLoading = false,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
}) => {
  const safeTotalPages = Math.max(totalPages, 1)
  const currentPage = Math.min(Math.max(page, 1), safeTotalPages)
  const start = count === 0 ? 0 : (currentPage - 1) * limit + 1
  const end = Math.min(currentPage * limit, count)

  return (
    <div
      className="data-table__footer"
      data-testid="pagination"
      data-page={currentPage}
      data-total-pages={safeTotalPages}
    >
      {pageSizeOptions && onPageSizeChange && (
        <div className="data-table__footer-cell">
          <span className="data-table__footer-label">Items per page:</span>
          <select
            className="data-table__footer-select"
            value={limit}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={isLoading}
            aria-label="Items per page"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="data-table__footer-cell data-table__footer-cell--grow">
        <span className="data-table__footer-range">
          {start} - {end} of {count} items
        </span>
      </div>

      <div className="data-table__footer-cell">
        <span className="data-table__footer-range" aria-live="polite" aria-atomic="true">
          Page {currentPage} of {safeTotalPages}
        </span>
      </div>

      <div className="data-table__footer-cell">
        <button
          className="data-table__footer-nav-btn"
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Previous page"
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
        </button>
      </div>

      <div className="data-table__footer-cell data-table__footer-cell--last">
        <button
          className="data-table__footer-nav-btn"
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Next page"
        >
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default TablePaginationFooter
