import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../Input'

describe('Input', () => {
  it('renders input field', () => {
    render(<Input />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders with label', () => {
    render(<Input label="Email" />)
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('renders with description', () => {
    render(<Input description="Enter your email address" />)
    expect(screen.getByText('Enter your email address')).toBeInTheDocument()
  })

  it('renders input with value', () => {
    render(<Input value="test value" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('test value')
  })

  it('renders with medium size by default', () => {
    render(<Input />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders with small size', () => {
    render(<Input size="small" />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders with required attribute', () => {
    render(<Input isRequired />)
    expect(screen.getByRole('textbox')).toBeRequired()
  })

  it('accepts user input', async () => {
    const user = (await import('@testing-library/user-event')).default
    render(<Input />)
    const input = screen.getByRole('textbox')
    await user.type(input, 'test@example.com')
    expect(input).toHaveValue('test@example.com')
  })

  it('calls onChange handler', async () => {
    const user = (await import('@testing-library/user-event')).default
    const handleChange = vi.fn()
    render(<Input onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    await user.type(input, 'hello')
    expect(handleChange).toHaveBeenCalled()
  })

  it('accepts value prop', () => {
    render(<Input value="initial value" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('initial value')
  })
})
