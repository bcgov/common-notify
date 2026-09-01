import { validate } from 'class-validator'
import { NotifySmsRecipients } from './notify-sms-recipients'

describe('NotifySmsRecipients', () => {
  it('accepts an array of valid E.164 recipients', async () => {
    const recipients = Object.assign(new NotifySmsRecipients(), {
      to: ['+12505550123', '+491512345678901'],
    })

    expect(await validate(recipients)).toHaveLength(0)
  })

  it('rejects one unresolvable entry and identifies its index and value', async () => {
    const recipients = Object.assign(new NotifySmsRecipients(), {
      to: ['+12505550123', '12345', '+12505550124'],
    })
    const errors = await validate(recipients)

    expect(errors).toHaveLength(1)
    expect(errors[0].constraints?.isNormalizablePhoneNumber).toBe(
      "to[1] '12345' is not a valid phone number",
    )
  })

  it('still rejects an empty recipient array', async () => {
    const recipients = Object.assign(new NotifySmsRecipients(), { to: [] })
    const errors = await validate(recipients)

    expect(errors).toHaveLength(1)
    expect(errors[0].constraints?.arrayMinSize).toBeDefined()
  })

  it.each(['250-555-1234', '(250) 555-1234'])(
    'accepts normalizable non-canonical recipient %s without mutating the DTO',
    async (value) => {
      const recipients = Object.assign(new NotifySmsRecipients(), { to: [value] })
      const errors = await validate(recipients)

      expect(errors).toHaveLength(0)
      expect(recipients.to[0]).toBe(value)
    },
  )
})
