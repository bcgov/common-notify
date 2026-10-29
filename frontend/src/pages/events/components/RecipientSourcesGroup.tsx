import type { FC } from 'react'
import { Checkbox, CheckboxGroup } from '@bcgov/design-system-react-components'
import { ADDITIONAL_RECIPIENTS_ID, CSTAR_GROUPS_ID, SUBSCRIPTION_SERVICE_ID } from '../constants'

type RecipientSourcesGroupProps = {
  value: string[]
  onChange: (value: string[]) => void
  isDisabled?: boolean
  /** Shown once there is something to report; the group is marked invalid while it is set. */
  errorMessage?: string
  /** False on channels that cannot address CSTAR groups yet. */
  isCstarEnabled?: boolean
}

/** The "Recipient(s)" checkboxes that choose which recipient sources a channel sends to. */
const RecipientSourcesGroup: FC<RecipientSourcesGroupProps> = ({
  value,
  onChange,
  isDisabled,
  errorMessage,
  isCstarEnabled = true,
}) => (
  <CheckboxGroup
    label="Recipient(s)"
    value={value}
    onChange={onChange}
    isDisabled={isDisabled}
    isRequired
    // Native validation flags an empty group as soon as it is touched; the tabs drive the error
    // themselves instead so it only appears after a save attempt.
    validationBehavior="aria"
    isInvalid={Boolean(errorMessage)}
    errorMessage={errorMessage}
  >
    <Checkbox value={SUBSCRIPTION_SERVICE_ID} isDisabled>
      Subscription Service
    </Checkbox>
    <Checkbox value={CSTAR_GROUPS_ID} isDisabled={!isCstarEnabled}>
      CSTAR Group(s)
    </Checkbox>
    <Checkbox value={ADDITIONAL_RECIPIENTS_ID}>Additional recipient(s)</Checkbox>
  </CheckboxGroup>
)

export default RecipientSourcesGroup
