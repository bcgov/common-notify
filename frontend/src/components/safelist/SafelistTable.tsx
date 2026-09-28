import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { ChannelBadge } from '@/components/ChannelBadge'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
import type { SafelistEntry } from '@/interfaces/safelist.interface'

interface SafelistTableProps {
  entries: SafelistEntry[]
  isLoading?: boolean
  /** Disables the remove buttons while a mutation is in flight. */
  isBusy?: boolean
  onRemove: (entry: SafelistEntry) => void
  emptyMessage?: string
}

/**
 * The tenant's safelisted recipients, rendered with the shared DataTable so sorting, empty and
 * loading states look the same as every other list in the app.
 */
export const SafelistTable: FC<SafelistTableProps> = ({
  entries,
  isLoading = false,
  isBusy = false,
  onRemove,
  emptyMessage = 'No recipients are safelisted.',
}) => {
  const columns: TableColumn<SafelistEntry>[] = [
    {
      key: 'channelCode',
      label: 'Channel',
      width: '120px',
      render: (value) => <ChannelBadge channels={[value as string]} />,
    },
    {
      key: 'recipient',
      label: 'Recipient',
      render: (value) => <span>{value as string}</span>,
    },
    {
      key: 'label',
      label: 'Label',
      render: (value) => (value ? <span>{value as string}</span> : <span aria-hidden>—</span>),
    },
    {
      // createdByName, not createdBy: the stored value is an IDIR GUID.
      key: 'createdByName',
      label: 'Added by',
      width: '200px',
      render: (value) => (value ? <span>{value as string}</span> : <span aria-hidden>—</span>),
    },
    {
      key: 'id',
      label: 'Actions',
      width: '120px',
      render: (_, row) => (
        <Button
          variant="secondary"
          size="small"
          isDisabled={isBusy}
          onPress={() => onRemove(row)}
          aria-label={`Remove ${row.recipient} from the safelist`}
        >
          Remove
        </Button>
      ),
    },
  ]

  return (
    <DataTable<SafelistEntry>
      columns={columns}
      data={entries}
      keyExtractor={(entry) => entry.id}
      isLoading={isLoading}
      isEmpty={entries.length === 0}
      emptyMessage={emptyMessage}
      label="Safelisted recipients"
      size="sm"
    />
  )
}

export default SafelistTable
