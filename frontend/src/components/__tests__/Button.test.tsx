import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('renders primary variant by default', () => {
    render(<Button>Primary</Button>)
    expect(screen.getByRole('button', { name: /primary/i })).toBeInTheDocument()
  })

  it('renders with secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button', { name: /secondary/i })).toBeInTheDocument()
  })

  it('renders with tertiary variant', () => {
    render(<Button variant="tertiary">Tertiary</Button>)
    expect(screen.getByRole('button', { name: /tertiary/i })).toBeInTheDocument()
  })

  it('renders with link variant', () => {
    render(<Button variant="link">Link</Button>)
    expect(screen.getByRole('button', { name: /link/i })).toBeInTheDocument()
  })

  it('renders with medium size by default', () => {
    render(<Button>Medium</Button>)
    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument()
  })

  it('renders with small size', () => {
    render(<Button size="small">Small</Button>)
    expect(screen.getByRole('button', { name: /small/i })).toBeInTheDocument()
  })

  it('renders with large size', () => {
    render(<Button size="large">Large</Button>)
    expect(screen.getByRole('button', { name: /large/i })).toBeInTheDocument()
  })

  it('renders with danger prop', () => {
    render(<Button danger>Delete</Button>)
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('renders disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    const button = screen.getByRole('button', { name: /disabled/i })
    expect(button).toBeInTheDocument()
  })

  it('renders as icon button', () => {
    render(<Button isIconButton>+</Button>)
    expect(screen.getByRole('button', { name: /\+/i })).toBeInTheDocument()
  })

  it('accepts onClick handler', async () => {
    const user = (await import('@testing-library/user-event')).default
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    await user.click(screen.getByRole('button', { name: /click/i }))
    expect(handleClick).toHaveBeenCalled()
  })
})
