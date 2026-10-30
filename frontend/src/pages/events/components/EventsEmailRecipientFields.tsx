import type { FC } from 'react'
import EventsAdditionalRecipients from './EventsAdditionalRecipients'
import type { RecipientAddresses } from './EventsAdditionalRecipients'
import EventsEmailCstarGroups from './EventsEmailCstarGroups'
import EventsRecipientSourcesGroup from './EventsRecipientSourcesGroup'
import { ADDITIONAL_RECIPIENTS_ID, CSTAR_GROUPS_ID } from '../constants'
import type { EmailRecipients } from '../hooks/useEmailRecipients'
import type { CstarGroup } from '@/api/cstar.api'

type EventsEmailRecipientFieldsProps = {
  recipients: EmailRecipients
  /** Addresses in the additional recipient fields that are not valid email addresses. */
  invalidAddresses: RecipientAddresses
  /** The tenant's CSTAR groups, the options the group picker offers. */
  cstarGroups: CstarGroup[]
  isDisabled: boolean
  errorMessage: string
  /** Called after any recipient field is edited. */
  onChange: () => void
}

/** The email tab's recipient sources, and the CSTAR group and address fields of those chosen. */
const EventsEmailRecipientFields: FC<EventsEmailRecipientFieldsProps> = ({
  recipients,
  invalidAddresses,
  cstarGroups,
  isDisabled,
  errorMessage,
  onChange,
}) => (
  <>
    <EventsRecipientSourcesGroup
      value={recipients.sources}
      onChange={(value) => {
        recipients.setSources(value)
        onChange()
      }}
      isDisabled={isDisabled}
      errorMessage={errorMessage}
    />

    {recipients.sources.includes(CSTAR_GROUPS_ID) && (
      <EventsEmailCstarGroups
        values={recipients.groups}
        groups={cstarGroups}
        onChange={(value) => {
          recipients.setGroups(value)
          onChange()
        }}
        isDisabled={isDisabled}
      />
    )}

    {recipients.sources.includes(ADDITIONAL_RECIPIENTS_ID) && (
      <EventsAdditionalRecipients
        values={recipients.addresses}
        onChange={(value) => {
          recipients.setAddresses(value)
          onChange()
        }}
        invalidAddresses={invalidAddresses}
        isDisabled={isDisabled}
      />
    )}
  </>
)

export default EventsEmailRecipientFields
