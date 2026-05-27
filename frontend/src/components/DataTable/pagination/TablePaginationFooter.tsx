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
      <div className="data-table__footer-left">
        {pageSizeOptions && onPageSizeChange && (
          <>
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
          </>
        )}
      </div>

      <div className="data-table__footer-right">
        <span className="data-table__footer-range">
          {start} - {end} of {count} items
        </span>
        <select
          className="data-table__footer-select"
          value={currentPage}
          onChange={(e) => onPageChange(Number(e.target.value))}
          disabled={isLoading || safeTotalPages <= 1}
          aria-label="Page number"
        >
          {Array.from({ length: safeTotalPages }, (_, i) => i + 1).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="data-table__footer-label">of {safeTotalPages} page(s)</span>
        <button
          className="data-table__footer-nav-btn"
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Prev"
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
        </button>
        <button
          className="data-table__footer-nav-btn"
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Next"
        >
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default TablePaginationFooter
