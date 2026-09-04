import { useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import { Button, TextArea, TextField } from '@bcgov/design-system-react-components'
import StickyBar from '@/components/StickyBar'

export type EventSettingsValues = {
  name: string
  description: string
}

type EventsTabProps = {
  values: EventSettingsValues
  /** Creates or updates the event; the page owns which. Must not reject. */
  onSave: (values: EventSettingsValues) => Promise<void>
  isDisabled?: boolean
}

const EventsTab: FC<EventsTabProps> = ({ values, onSave, isDisabled = false }) => {
  // Seeded once at mount. The page passes the saved event back in via `values`, which is
  // what the change check below compares against, so there is no effect keeping these in sync.
  const [name, setName] = useState(values.name)
  const [description, setDescription] = useState(values.description)
  const [saving, setSaving] = useState(false)

  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  // Simple check for whether or not a value has changed from the existing value
  const settingsChanged = trimmedName !== values.name || trimmedDescription !== values.description
  const isSaveDisabled =
    isDisabled || saving || !trimmedName || !trimmedDescription || !settingsChanged

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaveDisabled) {
      return
    }

    setSaving(true)
    try {
      await onSave({ name: trimmedName, description: trimmedDescription })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="events__form" onSubmit={handleSubmit}>
      <h2 className="events__section-heading">Event Settings</h2>

      <TextField
        label="Event name"
        value={name}
        onChange={setName}
        size="small"
        isDisabled={saving || isDisabled}
        isRequired
      />

      <TextArea
        label="Event description"
        value={description}
        onChange={setDescription}
        isDisabled={saving || isDisabled}
        isRequired
      />

      <StickyBar>
        <Button type="submit" variant="primary" isDisabled={isSaveDisabled}>
          {saving ? 'Saving…' : 'Save Event Settings'}
        </Button>
      </StickyBar>
    </form>
  )
}

export default EventsTab
