import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@/test-utils'
import PaginationControls from './PaginationControls'

describe('PaginationControls', () => {
  it('renders navigation controls and marks the current page', () => {
    render(
      <PaginationControls page={2} totalPages={3} count={25} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Prev' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows all page numbers when total pages are 7 or fewer', () => {
    render(
      <PaginationControls page={3} totalPages={7} count={70} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.queryByText('...')).toBeNull()
    for (const pageNumber of ['1', '2', '3', '4', '5', '6', '7']) {
      expect(screen.getByRole('button', { name: pageNumber })).toBeTruthy()
    }
  })

  it('shows ellipses and keeps first, last, current, and adjacent pages when total pages are 8 or more', () => {
    render(
      <PaginationControls page={5} totalPages={10} count={100} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getAllByText('...')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '5' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '6' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '10' })).toBeTruthy()
  })

  it('renders 1 2 ... 8 for totalPages=8 and page=1', () => {
    render(
      <PaginationControls page={1} totalPages={8} count={80} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '8' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '3' })).toBeNull()
    expect(screen.getAllByText('...')).toHaveLength(1)
  })

  it('renders 1 2 3 ... 8 for totalPages=8 and page=2', () => {
    render(
      <PaginationControls page={2} totalPages={8} count={80} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '8' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '4' })).toBeNull()
    expect(screen.getAllByText('...')).toHaveLength(1)
  })

  it('renders 1 2 3 4 5 ... 8 for totalPages=8 and page=4', () => {
    render(
      <PaginationControls page={4} totalPages={8} count={80} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: '4' })).toHaveAttribute('aria-current', 'page')
    for (const pageNumber of ['1', '2', '3', '4', '5', '8']) {
      expect(screen.getByRole('button', { name: pageNumber })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: '6' })).toBeNull()
    expect(screen.getAllByText('...')).toHaveLength(1)
  })

  it('renders 1 ... 6 7 8 for totalPages=8 and page=7', () => {
    render(
      <PaginationControls page={7} totalPages={8} count={80} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: '7' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '6' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '8' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '5' })).toBeNull()
    expect(screen.getAllByText('...')).toHaveLength(1)
  })

  it('renders 1 ... 7 8 for totalPages=8 and page=8', () => {
    render(
      <PaginationControls page={8} totalPages={8} count={80} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: '8' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '7' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '6' })).toBeNull()
    expect(screen.getAllByText('...')).toHaveLength(1)
  })

  it('disables Previous on the first page', () => {
    render(
      <PaginationControls page={1} totalPages={3} count={25} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
  })

  it('disables Next on the last page', () => {
    render(
      <PaginationControls page={3} totalPages={3} count={25} limit={10} onPageChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('hides itself when count is less than or equal to limit', () => {
    const { container } = render(
      <PaginationControls page={1} totalPages={1} count={10} limit={10} onPageChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('hides itself when count is 0', () => {
    const { container } = render(
      <PaginationControls page={1} totalPages={0} count={0} limit={10} onPageChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('hides itself when limit is 0', () => {
    const { container } = render(
      <PaginationControls page={1} totalPages={3} count={25} limit={0} onPageChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('disables both navigation buttons while loading', () => {
    render(
      <PaginationControls
        page={2}
        totalPages={3}
        count={25}
        limit={10}
        isLoading
        onPageChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('calls onPageChange for previous, next, and numbered page clicks when enabled', () => {
    const onPageChange = vi.fn()

    render(
      <PaginationControls
        page={2}
        totalPages={5}
        count={50}
        limit={10}
        onPageChange={onPageChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: '4' }))

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3)
    expect(onPageChange).toHaveBeenNthCalledWith(3, 4)
  })

  it('does not call onPageChange when disabled buttons are clicked', () => {
    const onPageChange = vi.fn()

    render(
      <PaginationControls
        page={1}
        totalPages={8}
        count={80}
        limit={10}
        isLoading
        onPageChange={onPageChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: '2' }))

    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('renders a safe current page when page is greater than total pages', () => {
    render(
      <PaginationControls
        page={12}
        totalPages={10}
        count={100}
        limit={10}
        onPageChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute('aria-current', 'page')
  })
})
