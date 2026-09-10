import { useState } from 'react'
import type { FC } from 'react'
import { Checkbox, Select } from '@bcgov/design-system-react-components'
import type { CstarGroup } from '@/api/cstar.api'

export type CstarGroupFieldId = 'to' | 'cc' | 'bcc'
/** Selected CSTAR group IDs per recipient field. */
export type CstarGroupSelections = Record<CstarGroupFieldId, string[]>

const GROUP_FIELDS: { id: CstarGroupFieldId; label: string }[] = [
  { id: 'to', label: 'To' },
  { id: 'cc', label: 'CC' },
  { id: 'bcc', label: 'BCC' },
]

type GroupField = {
  enabled: boolean
  groupIds: string[]
}

function buildInitialFields(values: CstarGroupSelections): Record<CstarGroupFieldId, GroupField> {
  return GROUP_FIELDS.reduce(
    (fields, { id }) => ({
      ...fields,
      [id]: { enabled: values[id].length > 0, groupIds: values[id] },
    }),
    {} as Record<CstarGroupFieldId, GroupField>,
  )
}

/** Group IDs to report to the parent: only for fields the user has checked on. */
function exportSelections(fields: Record<CstarGroupFieldId, GroupField>): CstarGroupSelections {
  return GROUP_FIELDS.reduce(
    (values, { id }) => ({ ...values, [id]: fields[id].enabled ? fields[id].groupIds : [] }),
    {} as CstarGroupSelections,
  )
}

/**
 * The group IDs already spoken for by the other fields, so a group addresses a notification
 * through one field only. Unchecked fields are ignored: their IDs are not saved either.
 */
function groupIdsUsedByOtherFields(
  fields: Record<CstarGroupFieldId, GroupField>,
  field: CstarGroupFieldId,
): Set<string> {
  return new Set(
    GROUP_FIELDS.filter(({ id }) => id !== field && fields[id].enabled).flatMap(
      ({ id }) => fields[id].groupIds,
    ),
  )
}

type EventsCstarGroupsProps = {
  /** Saved group IDs per field, seeded once at mount the same way EventsEmailTab seeds its fields. */
  values: CstarGroupSelections
  /** The tenant's CSTAR groups, used to label the selections and populate the pickers. */
  groups: CstarGroup[]
  /** Called with the group IDs that should be saved whenever a field or its checkbox changes. */
  onChange: (values: CstarGroupSelections) => void
  isDisabled?: boolean
}

/**
 * CSTAR group recipients for the email channel, shown once "CSTAR Group(s)" is selected in the
 * Recipient(s) field.
 *
 * Only the group IDs are held here; the members behind a group are resolved from CSTAR when the
 * notification is sent, so a group gaining or losing people needs no change to the event.
 */
const EventsCstarGroups: FC<EventsCstarGroupsProps> = ({
  values,
  groups,
  onChange,
  isDisabled = false,
}) => {
  const [fields, setFields] = useState(() => buildInitialFields(values))

  const groupItems = groups.map((group) => ({ id: group.id, label: group.name }))

  function updateField(id: CstarGroupFieldId, changes: Partial<GroupField>) {
    const updated = { ...fields[id], ...changes }
    // Checking a field back on restores the IDs it was holding when it was unchecked, which
    // another field may have claimed while it was off. Drop those, so the one route back to a
    // group sitting in two fields is closed the same way the pickers close the others.
    if (changes.enabled === true && !fields[id].enabled) {
      const usedElsewhere = groupIdsUsedByOtherFields(fields, id)
      updated.groupIds = updated.groupIds.filter((groupId) => !usedElsewhere.has(groupId))
    }

    const next = { ...fields, [id]: updated }
    setFields(next)
    onChange(exportSelections(next))
  }

  return (
    <div className="events__additional-recipients" role="group" aria-label="CSTAR groups">
      <span className="events__field-label">CSTAR Groups (required)</span>

      {GROUP_FIELDS.map(({ id, label }) => {
        const field = fields[id]
        const usedElsewhere = groupIdsUsedByOtherFields(fields, id)
        // A group picked in another field is dropped from this one's options rather than
        // flagged after the fact. Groups this field already holds stay listed even when a
        // sibling holds them too, so a duplicate saved before this rule existed can still be
        // seen and removed.
        const availableItems = groupItems.filter(
          (item) => !usedElsewhere.has(item.id) || field.groupIds.includes(item.id),
        )

        return (
          <div className="events__recipient-group" key={id}>
            <Checkbox
              isSelected={field.enabled}
              onChange={(enabled) => updateField(id, { enabled })}
              isDisabled={isDisabled}
            >
              {label}
            </Checkbox>

            {field.enabled && (
              <Select
                selectionMode="multiple"
                aria-label={`${label} CSTAR groups`}
                placeholder="Select group(s)..."
                items={availableItems}
                value={field.groupIds}
                onChange={(keys) => updateField(id, { groupIds: keys.map(String) })}
                size="small"
                isDisabled={isDisabled}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default EventsCstarGroups
