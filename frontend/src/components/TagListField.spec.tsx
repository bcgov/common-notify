import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagListField from './TagListField'

type HarnessProps = {
  initial?: string[]
  onChange?: (values: string[]) => void
  isDisabled?: boolean
  isInvalid?: boolean
  errorMessage?: string
}

/** The field is controlled, so the tests drive it through a parent that owns the values. */
function Harness({ initial = [], onChange, ...rest }: HarnessProps) {
  const [values, setValues] = useState(initial)

  return (
    <TagListField
      values={values}
      onChange={(next) => {
        setValues(next)
        onChange?.(next)
      }}
      aria-label="To email addresses"
      placeholder="Enter email addresses"
      {...rest}
    />
  )
}

const input = () => screen.getByRole('textbox', { name: 'To email addresses' })

describe('TagListField', () => {
  it('shows nothing but the input until a value is entered', () => {
    render(<Harness />)

    expect(input()).toHaveValue('')
    expect(screen.queryByRole('row')).not.toBeInTheDocument()
  })

  it('renders each saved value as a removable tag', () => {
    render(<Harness initial={['alice@gov.bc.ca', 'bob@gov.bc.ca']} />)

    expect(screen.getByRole('row', { name: 'alice@gov.bc.ca' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove bob@gov\.bc\.ca/ })).toBeInTheDocument()
  })

  it('commits what was typed when a space is entered', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.type(input(), 'alice@gov.bc.ca ')

    expect(onChange).toHaveBeenLastCalledWith(['alice@gov.bc.ca'])
    expect(screen.getByRole('row', { name: 'alice@gov.bc.ca' })).toBeInTheDocument()
    // The delimiter itself is not left behind in the input.
    expect(input()).toHaveValue('')
  })

  it.each([
    ['comma', ','],
    ['semicolon', ';'],
  ])('commits what was typed on a %s', async (_name, delimiter) => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.type(input(), `alice@gov.bc.ca${delimiter}`)

    expect(onChange).toHaveBeenLastCalledWith(['alice@gov.bc.ca'])
    expect(input()).toHaveValue('')
  })

  it('keeps the part after the delimiter as the value still being typed', async () => {
    render(<Harness />)

    await userEvent.type(input(), 'alice@gov.bc.ca bo')

    expect(screen.getByRole('row', { name: 'alice@gov.bc.ca' })).toBeInTheDocument()
    expect(input()).toHaveValue('bo')
  })

  it('commits every address in a pasted list at once', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.click(input())
    await userEvent.paste('alice@gov.bc.ca, bob@gov.bc.ca; carol@gov.bc.ca ')

    expect(onChange).toHaveBeenLastCalledWith([
      'alice@gov.bc.ca',
      'bob@gov.bc.ca',
      'carol@gov.bc.ca',
    ])
  })

  it('commits the value being typed when the field is left', async () => {
    const onChange = vi.fn()
    render(
      <>
        <Harness onChange={onChange} />
        <button type="button">Elsewhere</button>
      </>,
    )

    await userEvent.type(input(), 'alice@gov.bc.ca')
    // Still only a draft: nothing has been committed as a tag yet.
    expect(screen.queryByRole('row')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))

    // Losing the field would otherwise lose the address, which is the trap this guards.
    expect(onChange).toHaveBeenLastCalledWith(['alice@gov.bc.ca'])
    expect(input()).toHaveValue('')
  })

  it('trims the value committed on blur', async () => {
    const onChange = vi.fn()
    render(
      <>
        <Harness onChange={onChange} />
        <button type="button">Elsewhere</button>
      </>,
    )

    await userEvent.type(input(), '  alice@gov.bc.ca')
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))

    expect(onChange).toHaveBeenLastCalledWith(['alice@gov.bc.ca'])
  })

  it('does not commit anything when the field is left empty', async () => {
    const onChange = vi.fn()
    render(
      <>
        <Harness onChange={onChange} />
        <button type="button">Elsewhere</button>
      </>,
    )

    await userEvent.click(input())
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores an address that has already been entered', async () => {
    const onChange = vi.fn()
    render(<Harness initial={['alice@gov.bc.ca']} onChange={onChange} />)

    await userEvent.type(input(), 'alice@gov.bc.ca ')

    expect(onChange).toHaveBeenLastCalledWith(['alice@gov.bc.ca'])
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  it('removes a tag when its remove button is used', async () => {
    const onChange = vi.fn()
    render(<Harness initial={['alice@gov.bc.ca', 'bob@gov.bc.ca']} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /Remove alice@gov\.bc\.ca/ }))

    expect(onChange).toHaveBeenLastCalledWith(['bob@gov.bc.ca'])
    expect(screen.queryByRole('row', { name: 'alice@gov.bc.ca' })).not.toBeInTheDocument()
  })

  it('shows the error message and describes the input with it when invalid', () => {
    render(
      <Harness
        initial={['not-an-email']}
        isInvalid
        errorMessage="Enter valid email addresses. Invalid: not-an-email"
      />,
    )

    expect(input()).toHaveAccessibleDescription(
      'Enter valid email addresses. Invalid: not-an-email',
    )
  })

  it('shows no error message when the field is valid', () => {
    render(<Harness initial={['alice@gov.bc.ca']} />)

    expect(screen.queryByText(/Enter valid email addresses/)).not.toBeInTheDocument()
  })

  it('cannot be typed into when disabled', () => {
    render(<Harness initial={['alice@gov.bc.ca']} isDisabled />)

    expect(input()).toBeDisabled()
  })
})
