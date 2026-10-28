import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent } from '@/test-utils'
import TablePaginationFooter from './TablePaginationFooter'

describe('TablePaginationFooter', () => {
  it('shows empty totals and disables navigation', () => {
    render(
      <TablePaginationFooter page={0} totalPages={0} count={0} limit={15} onPageChange={vi.fn()} />,
    )
    expect(screen.getByText('0 - 0 of 0 items')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })
  it('emits page and numeric page size changes', async () => {
    const onPageChange = vi.fn(),
      onPageSizeChange = vi.fn()
    render(
      <TablePaginationFooter
        page={2}
        totalPages={3}
        count={35}
        limit={15}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[15, 30]}
      />,
    )
    expect(screen.getByText('16 - 30 of 35 items')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(3)
    await userEvent.selectOptions(screen.getByRole('combobox'), '30')
    expect(onPageSizeChange).toHaveBeenCalledWith(30)
  })
  it('blocks changes while loading and clamps an out of range page', () => {
    render(
      <TablePaginationFooter
        page={9}
        totalPages={3}
        count={35}
        limit={15}
        isLoading
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        pageSizeOptions={[15]}
      />,
    )
    expect(screen.getByText('31 - 35 of 35 items')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  })
})
