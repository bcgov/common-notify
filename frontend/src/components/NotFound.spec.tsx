import { vi } from 'vitest'
import { render, screen, userEvent } from '@/test-utils'
import NotFound from './NotFound'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

describe('NotFound', () => {
  test('renders a heading with the correct text', () => {
    render(<NotFound />)
    const headingElement = screen.getByRole('heading', { name: /404/i })
    expect(headingElement).toBeInTheDocument()
  })
  test('navigates home from the missing page', async () => {
    render(<NotFound />)
    await userEvent.click(screen.getByRole('button', { name: 'Back Home' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
  })
})
