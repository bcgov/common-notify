import type { FC } from 'react'
import { Radio, RadioGroup, TextField } from '@bcgov/design-system-react-components'
import type { AddRecipients, Recipient } from '../utils/testSend'

interface EventsTestSendRecipientFieldsProps {
  recipient: Recipient | null
  onRecipientChange: (recipient: Recipient) => void
  addRecipients: AddRecipients | null
  onAddRecipientsChange: (addRecipients: AddRecipients) => void
  otherEmail: string
  onOtherEmailChange: (email: string) => void
  recipientError?: string
  addRecipientsError?: string
  emailError: string
}

/** Who a test goes to: the signed-in user, one typed address, or the rows of an upload. */
const EventsTestSendRecipientFields: FC<EventsTestSendRecipientFieldsProps> = ({
  recipient,
  onRecipientChange,
  addRecipients,
  onAddRecipientsChange,
  otherEmail,
  onOtherEmailChange,
  recipientError,
  addRecipientsError,
  emailError,
}) => (
  <>
    <div className="events__test-send-recipients">
      <RadioGroup
        label="Recipient(s)"
        isRequired
        description="Choose who will receive the test notification"
        isInvalid={Boolean(recipientError)}
        errorMessage={recipientError}
        value={recipient ?? ''}
        onChange={(value) => onRecipientChange(value as Recipient)}
      >
        <Radio value="myself">Myself</Radio>
        <Radio value="other">Another recipient</Radio>
      </RadioGroup>
    </div>

    {recipient === 'other' && (
      <>
        <RadioGroup
          label="Add recipient(s)"
          isRequired
          isInvalid={Boolean(addRecipientsError)}
          errorMessage={addRecipientsError}
          value={addRecipients ?? ''}
          onChange={(value) => onAddRecipientsChange(value as AddRecipients)}
        >
          <Radio value="one">One recipient</Radio>
          <Radio value="many">Many recipients (upload a spreadsheet/CSV)</Radio>
        </RadioGroup>

        {addRecipients === 'one' && (
          <TextField
            label="Recipient email address"
            isRequired
            value={otherEmail}
            onChange={onOtherEmailChange}
            isInvalid={Boolean(emailError)}
            errorMessage={emailError}
            size="small"
          />
        )}
      </>
    )}
  </>
)

export default EventsTestSendRecipientFields
