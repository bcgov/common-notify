import { useState } from 'react'
import type { RecipientAddresses } from '../components/EventsAdditionalRecipients'
import type { CstarGroupSelections } from '../components/EventsCstarGroups'
import { ADDITIONAL_RECIPIENTS_ID, CSTAR_GROUPS_ID } from '../constants'
import type { EmailSettingsValues } from '../utils/emailSettings'

// Determine which recipients checkboxes start ticked when the tab is opened
function initialSources(values: EmailSettingsValues): string[] {
  const sources: string[] = []
  if (
    values.cstarGroupIdsTo.length ||
    values.cstarGroupIdsCc.length ||
    values.cstarGroupIdsBcc.length
  ) {
    sources.push(CSTAR_GROUPS_ID)
  }
  if (values.to.length || values.cc.length || values.bcc.length) {
    sources.push(ADDITIONAL_RECIPIENTS_ID)
  }
  return sources
}

/** The editable recipient state for the email tab, includes ticked sources, addresses, cstar groups */
export function useEmailRecipients(values: EmailSettingsValues) {
  // selected recipient sources (CSTAR Groups, Additional Recipients, Subscription Service)
  const [sources, setSources] = useState(() => initialSources(values))
  const [addresses, setAddresses] = useState<RecipientAddresses>({
    to: values.to,
    cc: values.cc,
    bcc: values.bcc,
  })
  const [groups, setGroups] = useState<CstarGroupSelections>({
    to: values.cstarGroupIdsTo,
    cc: values.cstarGroupIdsCc,
    bcc: values.cstarGroupIdsBcc,
  })

  return { sources, setSources, addresses, setAddresses, groups, setGroups }
}

export type EmailRecipients = ReturnType<typeof useEmailRecipients>
