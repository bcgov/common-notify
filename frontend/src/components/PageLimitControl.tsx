import type { FC } from 'react'
import { Select } from '@bcgov/design-system-react-components'

const PAGE_LIMIT_OPTIONS = [15, 30]

interface PageLimitControlProps {
  limit: number
  page: number
  count: number
  onLimitChange: (limit: number) => void
}

const PageLimitControl: FC<PageLimitControlProps> = ({ limit, page, count, onLimitChange }) => {
  const start = count === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, count)

  const items = PAGE_LIMIT_OPTIONS.map((option) => ({ id: String(option), label: String(option) }))

  return (
    <div className="page-limit-control">
      <Select
        className="page-limit-control__select"
        aria-label="Items per page"
        items={items}
        selectedKey={String(limit)}
        onSelectionChange={(key) => onLimitChange(Number(key))}
      />
      <span className="page-limit-control__result">
        Result: {start} - {end} of {count}
      </span>
    </div>
  )
}

export default PageLimitControl
