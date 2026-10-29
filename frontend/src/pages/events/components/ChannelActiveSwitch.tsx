import type { FC } from 'react'
import { Switch } from '@bcgov/design-system-react-components'

type ChannelActiveSwitchProps = {
  isSelected: boolean
  onChange?: (isSelected: boolean) => void
  isDisabled?: boolean
}

/** The "Activate channel" switch at the top of each channel tab. */
const ChannelActiveSwitch: FC<ChannelActiveSwitchProps> = ({
  isSelected,
  onChange,
  isDisabled,
}) => (
  <div className="events__switch-field">
    <span className="events__field-label">Activate channel</span>
    <Switch
      labelPosition="right"
      aria-label="Activate channel"
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      {isSelected ? 'On' : 'Off'}
    </Switch>
  </div>
)

export default ChannelActiveSwitch
