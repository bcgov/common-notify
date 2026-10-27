import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent, fireEvent } from '@/test-utils'
import { ColumnHeaderDropdown } from './ColumnHeaderDropdown'

describe('ColumnHeaderDropdown', () => {
  it.each([
    ['text', 'A to Z', 'Z to A'],
    ['numeric', 'Low to High', 'High to Low'],
    ['date', 'Oldest to Newest', 'Newest to Oldest'],
  ] as const)('sorts %s columns and deselects the current order', async (sortType, asc, desc) => {
    const onSort = vi.fn()
    render(
      <ColumnHeaderDropdown
        triggerLabel="Options"
        sortable
        sortType={sortType}
        sortOrder="asc"
        onSort={onSort}
        activeFilterValues={[]}
      >
        Options
      </ColumnHeaderDropdown>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: asc }))
    expect(onSort).toHaveBeenLastCalledWith(null)
    await userEvent.click(screen.getByRole('button', { name: 'Options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: desc }))
    expect(onSort).toHaveBeenLastCalledWith('desc')
  })
  it('stages filters until apply, supports removal and clearing', async () => {
    const onFilter = vi.fn()
    render(
      <ColumnHeaderDropdown
        triggerLabel="Options"
        sortOrder={null}
        activeFilterValues={['sent']}
        filterOptions={[
          { label: 'Sent', value: 'sent' },
          { label: 'Failed', value: 'failed' },
        ]}
        filterTitle="Status"
        onFilter={onFilter}
      >
        Options
      </ColumnHeaderDropdown>,
    )
    const open = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
    }
    await open()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sent' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Failed' }))
    expect(onFilter).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onFilter).toHaveBeenLastCalledWith(['failed'])
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onFilter).toHaveBeenLastCalledWith([])
    await open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
