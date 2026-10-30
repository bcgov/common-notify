import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { AlertDialog, Button, Modal } from '@bcgov/design-system-react-components'
import { getFeatureFlagHistory } from '@/api/featureFlags.api'
import type { FeatureFlagHistoryEntry } from '@/interfaces/feature-flag.interface'
import { DataTable } from './DataTable/DataTable'
import type { TableColumn } from './DataTable/DataTable'
import { StatusBadge } from './StatusBadge'
import Alert from './Alert'
import '@/scss/components/feature-flag-history-modal.scss'

type FeatureFlagHistoryModalProps = {
  /** The flag whose history to show; the modal is open while this is set. */
  flagId: string | null
  /** Flag display name, e.g. "SMS Notifications". */
  flagName: string
  /** Who the flag applies to, e.g. "All Tenants" or a tenant name. */
  scope: string
  onClose: () => void
}

function formatChangedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const columns: TableColumn<FeatureFlagHistoryEntry>[] = [
  {
    key: 'createdAt',
    label: 'Date',
    width: '200px',
    render: (value) => formatChangedAt(value as string),
  },
  {
    key: 'enabled',
    label: 'Change',
    width: '180px',
    render: (value) => <StatusBadge status={value as boolean} />,
  },
  {
    key: 'createdByName',
    label: 'Changed by',
    // The name is what a person recognises; the id is the fallback for changes made by
    // a token with no name claim, or by a process ("system", "migration").
    render: (_, row) => row.createdByName || row.createdBy,
  },
]

/**
 * The history table for one flag. Mounted fresh each time the modal opens (the modal does not
 * render its content while closed), so a toggle made just before opening is always included.
 */
const FeatureFlagHistoryTable: FC<{ flagId: string; flagName: string }> = ({
  flagId,
  flagName,
}) => {
  const [entries, setEntries] = useState<FeatureFlagHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Dropped if the modal closes before the response lands.
    let isCurrent = true

    getFeatureFlagHistory(flagId)
      .then((history) => {
        if (isCurrent) setEntries(history)
      })
      .catch((err: unknown) => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Failed to load feature flag history')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [flagId])

  if (error) return <Alert variant="danger">{error}</Alert>

  return (
    <DataTable<FeatureFlagHistoryEntry>
      columns={columns}
      data={entries}
      keyExtractor={(entry) => entry.id}
      isLoading={isLoading}
      isEmpty={entries.length === 0}
      emptyMessage="No changes have been recorded for this flag yet."
      label={`${flagName} change history`}
      size="sm"
    />
  )
}

/** Who enabled or disabled a feature flag, and when, newest first. */
const FeatureFlagHistoryModal: FC<FeatureFlagHistoryModalProps> = ({
  flagId,
  flagName,
  scope,
  onClose,
}) => {
  const title = `${flagName} history`

  return (
    <Modal
      isOpen={flagId !== null}
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialog
        isIconHidden
        isCloseable
        title={title}
        // AlertDialog renders `title` as a plain div rather than a <Heading slot="title">, so
        // the underlying Dialog needs an explicit label.
        aria-label={title}
        buttons={
          <Button variant="primary" onPress={onClose}>
            Close
          </Button>
        }
      >
        <div className="feature-flag-history">
          <p className="feature-flag-history__scope">Applies to: {scope}</p>
          {flagId && <FeatureFlagHistoryTable key={flagId} flagId={flagId} flagName={flagName} />}
        </div>
      </AlertDialog>
    </Modal>
  )
}

export default FeatureFlagHistoryModal
