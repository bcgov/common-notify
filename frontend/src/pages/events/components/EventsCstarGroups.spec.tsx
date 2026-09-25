import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EventsCstarGroups from './EventsCstarGroups'
import type { CstarGroupSelections } from './EventsCstarGroups'
import type { CstarGroup } from '@/api/cstar.api'

vi.mock('@bcgov/design-system-react-components', () => ({
  Checkbox: ({ children, isSelected, onChange, isDisabled }: any) => (
    <label>
      <input
        type="checkbox"
        checked={isSelected}
        disabled={isDisabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      {children}
    </label>
  ),
  Select: ({ items, value, onChange, ...props }: any) => (
    <select
      multiple
      aria-label={props['aria-label']}
      value={value}
      onChange={(event) =>
        onChange?.(Array.from(event.target.selectedOptions).map((option: any) => option.value))
      }
    >
      {items.map((item: any) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  ),
}))

const GROUPS: CstarGroup[] = [
  { id: 'group-1', name: 'Wildfire Ops', description: '' },
  { id: 'group-2', name: 'Flood Response', description: '' },
]

const EMPTY: CstarGroupSelections = { to: [], cc: [], bcc: [] }

function optionNames(fieldLabel: string): string[] {
  const select = screen.getByLabelText(fieldLabel)
  return Array.from(select.querySelectorAll('option')).map((option) => option.textContent ?? '')
}

describe('EventsCstarGroups cross-field selection', () => {
  it('offers a group to the other fields until one of them takes it', () => {
    render(
      <EventsCstarGroups
        values={{ ...EMPTY, to: ['group-1'] }}
        groups={GROUPS}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('CC'))

    expect(optionNames('CC CSTAR groups')).toEqual(['Flood Response'])
    expect(optionNames('To CSTAR groups')).toEqual(['Wildfire Ops', 'Flood Response'])
  })

  it('keeps listing a group a field already holds, so a duplicate can still be removed', () => {
    render(
      <EventsCstarGroups
        values={{ ...EMPTY, to: ['group-1'], cc: ['group-1'] }}
        groups={GROUPS}
        onChange={vi.fn()}
      />,
    )

    expect(optionNames('To CSTAR groups')).toContain('Wildfire Ops')
    expect(optionNames('CC CSTAR groups')).toContain('Wildfire Ops')
  })

  it('frees a group up again once the field holding it is unchecked', () => {
    render(
      <EventsCstarGroups
        values={{ ...EMPTY, to: ['group-1'] }}
        groups={GROUPS}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('BCC'))
    expect(optionNames('BCC CSTAR groups')).toEqual(['Flood Response'])

    fireEvent.click(screen.getByLabelText('To'))
    expect(optionNames('BCC CSTAR groups')).toEqual(['Wildfire Ops', 'Flood Response'])
  })

  it('does not restore a group another field claimed while this one was unchecked', () => {
    const onChange = vi.fn()
    render(
      <EventsCstarGroups
        values={{ ...EMPTY, cc: ['group-1'] }}
        groups={GROUPS}
        onChange={onChange}
      />,
    )

    // CC starts holding the group; park it, hand the group to To, then bring CC back.
    fireEvent.click(screen.getByLabelText('CC'))
    fireEvent.click(screen.getByLabelText('To'))
    fireEvent.change(screen.getByLabelText('To CSTAR groups'), { target: { value: 'group-1' } })
    fireEvent.click(screen.getByLabelText('CC'))

    expect(onChange).toHaveBeenLastCalledWith({ to: ['group-1'], cc: [], bcc: [] })
  })
})
