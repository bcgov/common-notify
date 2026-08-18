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

  it.each([
    ['12505551234', 'a missing plus prefix'],
    ['+1250555ABC4', 'non-numeric characters'],
    ['12345', 'a short code'],
    ['+4915123456789012', 'more than 15 digits'],
  ])('rejects %s (%s)', async (phoneNumber) => {
    const errors = await validate(requestWith(phoneNumber))
    const phoneNumberError = errors.find((error) => error.property === 'phone_number')

    expect(phoneNumberError?.constraints?.isE164).toBe('Phone number must be in E.164 format')
  })
})
