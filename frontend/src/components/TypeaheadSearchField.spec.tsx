import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, userEvent, within } from '@/test-utils'
import TypeaheadSearchField from './TypeaheadSearchField'

const tenants = ['Parks Booking', 'Parks Canada Liaison', 'Roads', 'Parks Booking']

function Harness({ onSearch, max }: { onSearch: (term: string) => void; max?: number }) {
  const [value, setValue] = useState('')
  return (
    <TypeaheadSearchField
      value={value}
      onChange={setValue}
      onSearch={onSearch}
      suggestions={tenants}
      ariaLabel="Search tenants"
      maxSuggestions={max}
    />
  )
}

const input = () => screen.getByRole('combobox', { name: 'Search tenants' })
const optionNames = async () =>
  within(await screen.findByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent)

describe('TypeaheadSearchField', () => {
  it('suggests each matching value once, ignoring case, matching anywhere', async () => {
    render(<Harness onSearch={vi.fn()} />)
    await userEvent.type(input(), 'PARKS')
    expect(await optionNames()).toEqual(['Parks Booking', 'Parks Canada Liaison'])
  })

  it('caps the number of suggestions', async () => {
    render(<Harness onSearch={vi.fn()} max={1} />)
    await userEvent.type(input(), 'parks')
    expect(await optionNames()).toEqual(['Parks Booking'])
  })

  it('searches once, for the suggestion, when one is picked with the keyboard', async () => {
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} />)
    await userEvent.type(input(), 'canada')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('Parks Canada Liaison')
    expect(input()).toHaveValue('Parks Canada Liaison')
  })

  it('searches for the typed text on Enter', async () => {
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} />)
    await userEvent.type(input(), 'ark{Enter}')
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('ark')
  })

  it('suggests nothing until something is typed', async () => {
    render(<Harness onSearch={vi.fn()} />)
    await userEvent.click(input())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('clears the text and the search, then returns focus to the field', async () => {
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} />)
    expect(screen.queryByRole('button', { name: 'Clear search text' })).not.toBeInTheDocument()

    await userEvent.type(input(), 'Roads{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search text' }))

    expect(input()).toHaveValue('')
    expect(input()).toHaveFocus()
    expect(onSearch).toHaveBeenLastCalledWith('')
    expect(screen.queryByRole('button', { name: 'Clear search text' })).not.toBeInTheDocument()
  })
})
