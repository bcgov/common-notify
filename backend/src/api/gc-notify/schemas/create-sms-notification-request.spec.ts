import { validate } from 'class-validator'
import { CreateSmsNotificationRequest } from './create-sms-notification-request'

describe('CreateSmsNotificationRequest', () => {
  const templateId = '12345678-1234-4234-8234-123456789012'

  function requestWith(phoneNumber: string): CreateSmsNotificationRequest {
    return Object.assign(new CreateSmsNotificationRequest(), {
      phone_number: phoneNumber,
      template_id: templateId,
    })
  }

  it('accepts a valid E.164 number containing the maximum 15 digits', async () => {
    const errors = await validate(requestWith('+491512345678901'))

    expect(errors).toHaveLength(0)
  })

  it('continues to accept a shorter valid E.164 number', async () => {
    const errors = await validate(requestWith('+12505551234'))

    expect(errors).toHaveLength(0)
  })

  it.each(['250-555-1234', '(250) 555-1234', '12505551234'])(
    'accepts resolvable non-canonical number %s',
    async (phoneNumber) => {
      expect(await validate(requestWith(phoneNumber))).toHaveLength(0)
    },
  )

  it.each([
    ['491512345678901', 'an unresolvable international number missing its plus prefix'],
    ['+1250555ABC4', 'non-numeric characters'],
    ['12345', 'a short code'],
    ['+49151234567890123', 'an overlong unresolvable number'],
  ])('rejects %s (%s)', async (phoneNumber) => {
    const errors = await validate(requestWith(phoneNumber))
    const phoneNumberError = errors.find((error) => error.property === 'phone_number')

    expect(phoneNumberError?.constraints?.isNormalizablePhoneNumber).toBe(
      'Phone number must be resolvable to E.164 format',
    )
  })
})
