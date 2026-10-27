import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent, fireEvent } from '@/test-utils'
import EmailLogoMenu from './EmailLogoMenu'

const logos = [
  { id: 'default', name: 'BC', imageUrl: '/bc.png', isDefault: true },
  { id: 'health', name: 'Health', imageUrl: '/health.png', isDefault: false },
]
describe('EmailLogoMenu', () => {
  it('shows unavailable, empty and loading states', async () => {
    const { rerender } = render(
      <EmailLogoMenu logos={[]} value={null} onChange={vi.fn()} isLoading />,
    )
    expect(screen.getByText('Loading logo...')).toBeInTheDocument()
    rerender(<EmailLogoMenu logos={[]} value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('No approved logos available.')).toBeInTheDocument()
    expect(screen.getByText('Unavailable logo')).toBeInTheDocument()
  })
  it('uses the default logo and supports search and mouse selection', async () => {
    const onChange = vi.fn()
    render(<EmailLogoMenu logos={logos} value={null} onChange={onChange} />)
    expect(screen.getByRole('button')).toHaveTextContent('Main BC Mark (Default)')
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search email logos' }), 'health')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.click(screen.getByRole('option', { name: /Health/ }))
    expect(onChange).toHaveBeenCalledWith('health')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('supports keyboard navigation, selection, escape and outside dismissal', async () => {
    const onChange = vi.fn()
    render(<EmailLogoMenu logos={logos} value={null} onChange={onChange} />)
    screen.getByRole('button').focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('health')
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search email logos' }), 'missing')
    expect(screen.getByText('No logos match your search.')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button')).toHaveFocus()
    await userEvent.click(screen.getByRole('button'))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('disables the trigger', () => {
    render(<EmailLogoMenu logos={logos} value={null} onChange={vi.fn()} isDisabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
