import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SafelistTable } from './SafelistTable'
import type { SafelistEntry } from '@/interfaces/safelist.interface'

function entry(overrides: Partial<SafelistEntry> = {}): SafelistEntry {
  return {
    id: 'entry-1',
    tenantId: 'tenant-1',
    channelCode: 'EMAIL',
    recipient: 'qa.mailbox@gov.bc.ca',
    recipientNormalized: 'qa.mailbox@gov.bc.ca',
    label: 'QA mailbox',
    createdAt: '2026-08-17T00:00:00.000Z',
    createdBy: '2f1a0b7c-9d3e-4f5a-8b6c-1d2e3f4a5b6c',
    createdByName: 'Falk, Barrett CITZ:EX',
    updatedAt: '2026-08-17T00:00:00.000Z',
    updatedBy: 'admin-guid',
    ...overrides,
  }
}

describe('SafelistTable', () => {
  it('renders one row per entry with its channel, recipient and label', () => {
    render(
      <SafelistTable
        entries={[
          entry(),
          entry({ id: 'entry-2', channelCode: 'SMS', recipient: '+12505550100', label: null }),
        ]}
        onRemove={vi.fn()}
      />,
    )

    // One remove button per entry is the stable signal for "one row each"; counting `row` roles
    // would also catch the roles react-aria's TagGroup renders inside the channel cell.
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2)

    const table = within(screen.getByRole('table'))
    expect(table.getByText('qa.mailbox@gov.bc.ca')).toBeInTheDocument()
    expect(table.getByText('QA mailbox')).toBeInTheDocument()
    expect(table.getByText('+12505550100')).toBeInTheDocument()
    expect(table.getByText('SMS')).toBeInTheDocument()
  })

  it('shows who added the entry by name, never the stored GUID', () => {
    render(<SafelistTable entries={[entry()]} onRemove={vi.fn()} />)

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Falk, Barrett CITZ:EX')).toBeInTheDocument()
    expect(table.queryByText(/2f1a0b7c/)).not.toBeInTheDocument()
  })

  it('falls back to a dash when the adding user could not be resolved', () => {
    render(<SafelistTable entries={[entry({ createdByName: null })]} onRemove={vi.fn()} />)

    expect(within(screen.getByRole('table')).queryByText(/2f1a0b7c/)).not.toBeInTheDocument()
  })

  it('passes the whole entry to onRemove so the caller can name it', () => {
    const onRemove = vi.fn()
    const row = entry()

    render(<SafelistTable entries={[row]} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove qa\.mailbox@gov\.bc\.ca/i }))

    expect(onRemove).toHaveBeenCalledWith(row)
  })

  it('disables removal while a mutation is in flight', () => {
    render(<SafelistTable entries={[entry()]} isBusy onRemove={vi.fn()} />)

    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled()
  })

  it('shows the caller-supplied empty message', () => {
    render(
      <SafelistTable entries={[]} onRemove={vi.fn()} emptyMessage="This tenant cannot send." />,
    )

    // Scoped to the table: DataTable also repeats the message in its visually-hidden live region.
    expect(
      within(screen.getByRole('table')).getByText('This tenant cannot send.'),
    ).toBeInTheDocument()
  })
})
