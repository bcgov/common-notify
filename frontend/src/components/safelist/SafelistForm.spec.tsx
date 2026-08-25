import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SafelistForm } from './SafelistForm'

vi.mock('@bcgov/design-system-react-components', () => ({
  Button: ({ children, isDisabled, onPress, ...props }: any) => (
    <button disabled={isDisabled} onClick={onPress} {...props}>
      {children}
    </button>
  ),
  TextField: ({ label, value, onChange, isDisabled }: any) => (
    <label>
      {label}
      <input
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  ),
  Select: ({ label, items, value, onChange }: any) => (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange?.(event.target.value)}>
        {items.map((item: any) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  ),
}))

describe('SafelistForm', () => {
  it('submits trimmed values for the selected channel', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<SafelistForm onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/channel/i), { target: { value: 'SMS' } })
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: '  (250) 555-0100  ' },
    })
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: ' QA phone ' } })
    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        channelCode: 'SMS',
        recipient: '(250) 555-0100',
        label: 'QA phone',
      }),
    )
  })

  it('sends a null label when none was entered', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<SafelistForm onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'qa@gov.bc.ca' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        channelCode: 'EMAIL',
        recipient: 'qa@gov.bc.ca',
        label: null,
      }),
    )
  })

  it('clears the fields once the entry is accepted', async () => {
    render(<SafelistForm onSubmit={vi.fn().mockResolvedValue(true)} />)

    const recipient = screen.getByLabelText(/email address/i)
    fireEvent.change(recipient, { target: { value: 'qa@gov.bc.ca' } })
    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => expect(recipient).toHaveValue(''))
  })

  it('keeps the value on screen when the entry is rejected, so it can be corrected', async () => {
    render(<SafelistForm onSubmit={vi.fn().mockResolvedValue(false)} />)

    const recipient = screen.getByLabelText(/email address/i)
    fireEvent.change(recipient, { target: { value: 'duplicate@gov.bc.ca' } })
    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => expect(recipient).toHaveValue('duplicate@gov.bc.ca'))
  })

  it('does not submit an empty recipient', () => {
    const onSubmit = vi.fn()
    render(<SafelistForm onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables submission when the safelist is full', () => {
    render(<SafelistForm onSubmit={vi.fn()} isFull />)

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'qa@gov.bc.ca' },
    })

    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()
  })
})
