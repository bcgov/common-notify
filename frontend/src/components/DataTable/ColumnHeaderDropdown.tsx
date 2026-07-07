import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FilterOption } from './DataTable'

interface ColumnHeaderDropdownProps {
  children: ReactNode
  sortable?: boolean
  sortType?: 'text' | 'numeric' | 'date'
  sortOrder: 'asc' | 'desc' | null
  onSort?: (order: 'asc' | 'desc' | null) => void
  filterOptions?: FilterOption[]
  filterTitle?: string
  activeFilterValues: string[]
  onFilter?: (values: string[]) => void
}

export function ColumnHeaderDropdown({
  children,
  sortable,
  sortType = 'text',
  sortOrder,
  onSort,
  filterOptions,
  filterTitle,
  activeFilterValues,
  onFilter,
}: ColumnHeaderDropdownProps) {
  const [open, setOpen] = useState(false)
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<string[]>(activeFilterValues)
  const containerRef = useRef<HTMLDivElement>(null)

  const [ascLabel, descLabel] =
    sortType === 'text' ? ['A to Z', 'Z to A'] : ['Oldest to Newest', 'Newest to Oldest']

  // Sync pending values when active filters change externally
  useEffect(() => {
    setPendingValues(activeFilterValues)
  }, [activeFilterValues])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSubmenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleToggle() {
    if (!open) {
      setPendingValues(activeFilterValues)
    }
    setOpen((prev) => !prev)
    setSubmenuOpen(false)
  }

  function handleSortOption(order: 'asc' | 'desc') {
    // Clicking the active sort option deselects it
    onSort?.(sortOrder === order ? null : order)
    setOpen(false)
    setSubmenuOpen(false)
  }

  function handleCheckboxChange(value: string, checked: boolean) {
    setPendingValues((prev) => (checked ? [...prev, value] : prev.filter((v) => v !== value)))
  }

  function handleApply() {
    onFilter?.(pendingValues)
    setOpen(false)
    setSubmenuOpen(false)
  }

  function handleClearAll() {
    setPendingValues([])
    onFilter?.([])
    setOpen(false)
    setSubmenuOpen(false)
  }

  return (
    <div ref={containerRef} className="data-table__dropdown-wrapper">
      <div onClick={handleToggle}>{children}</div>
      {open && (
        <div className="data-table__dropdown-menu" role="menu">
          {sortable && (
            <>
              <button
                type="button"
                role="menuitem"
                className={`data-table__dropdown-item${sortOrder === 'asc' ? ' data-table__dropdown-item--active' : ''}`}
                onClick={() => handleSortOption('asc')}
              >
                {ascLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                className={`data-table__dropdown-item${sortOrder === 'desc' ? ' data-table__dropdown-item--active' : ''}`}
                onClick={() => handleSortOption('desc')}
              >
                {descLabel}
              </button>
            </>
          )}
          {filterOptions && filterOptions.length > 0 && (
            <div
              className="data-table__dropdown-item data-table__dropdown-item--submenu"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={submenuOpen}
              onMouseEnter={() => setSubmenuOpen(true)}
              onMouseLeave={() => setSubmenuOpen(false)}
            >
              <span>Filter by</span>
              <span className="data-table__submenu-arrow">›</span>
              {submenuOpen && (
                <div className="data-table__submenu" role="menu">
                  {filterTitle && <div className="data-table__submenu-title">{filterTitle}</div>}
                  <div className="data-table__submenu-options">
                    {filterOptions.map((opt) => (
                      <label key={opt.value} className="data-table__filter-option">
                        <input
                          type="checkbox"
                          checked={pendingValues.includes(opt.value)}
                          onChange={(e) => handleCheckboxChange(opt.value, e.target.checked)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  <div className="data-table__submenu-actions">
                    <button type="button" className="data-table__apply-btn" onClick={handleApply}>
                      Apply
                    </button>
                    <button
                      type="button"
                      className="data-table__clear-btn"
                      onClick={handleClearAll}
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div
            className="data-table__dropdown-item data-table__dropdown-item--submenu"
            role="menuitem"
          >
            <span>Column settings</span>
          </div>
        </div>
      )}
    </div>
  )
}
