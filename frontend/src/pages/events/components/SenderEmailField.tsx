import type { FC } from 'react'
import {
  Button,
  SvgInfoIcon,
  TextField,
  Tooltip,
  TooltipTrigger,
} from '@bcgov/design-system-react-components'

const SENDER_EMAIL_TOOLTIP =
  'Replies and bounce messages may be sent to this address, but the inbox is not monitored.'

type SenderEmailFieldProps = {
  value: string
  onChange: (value: string) => void
  isDisabled: boolean
  /** Shown once there is something to report; the field is marked invalid while it is set. */
  errorMessage: string
}

/** The email tab's required sender address, with a tooltip on how the address is used. */
const SenderEmailField: FC<SenderEmailFieldProps> = ({
  value,
  onChange,
  isDisabled,
  errorMessage,
}) => (
  <TextField
    label={
      (
        <>
          Sender email address{' '}
          <TooltipTrigger>
            <Button
              aria-label="About the sender email address"
              className="events__tooltip-trigger"
              isIconButton
              size="xsmall"
              type="button"
              variant="tertiary"
            >
              <SvgInfoIcon />
            </Button>

            <Tooltip placement="right">{SENDER_EMAIL_TOOLTIP}</Tooltip>
          </TooltipTrigger>
        </>
      ) as unknown as string
    }
    value={value}
    onChange={onChange}
    description="The default sender email is based on your tenant but can be changed. It must be linked to a registered IDIR account or an approved email address."
    size="small"
    isDisabled={isDisabled}
    isRequired
    validationBehavior="aria"
    isInvalid={Boolean(errorMessage)}
    errorMessage={errorMessage}
  />
)

export default SenderEmailField
