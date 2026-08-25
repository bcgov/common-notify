import { validate } from 'class-validator'
import { IsNormalizablePhoneNumber } from './normalizable-phone-number.validator'

class PhoneNumberDto {
  @IsNormalizablePhoneNumber()
  phoneNumber: string
}

class PhoneNumbersDto {
  @IsNormalizablePhoneNumber({ each: true })
  phoneNumbers: string[]
}

describe('IsNormalizablePhoneNumber', () => {
  it.each([
    '+12505551234',
    '+491512345678901',
    '250-555-1234',
    '(250) 555-1234',
    '2505551234',
    '12505551234',
  ])('accepts resolvable phone number %s', async (value) => {
    const dto = Object.assign(new PhoneNumberDto(), { phoneNumber: value })
    expect(await validate(dto)).toHaveLength(0)
  })

  it.each([
    ['491512345678901', 'an unresolvable international number missing its plus prefix'],
    ['+02505551234', 'a leading zero after plus'],
    ['+12505551234 ext. 9', 'an extension'],
    ['', 'an empty string'],
    ['not-a-number', 'non-numeric input'],
    ['12345', 'a short code'],
    ['123456', 'a short code'],
    ['BCNOTIFY', 'an alphanumeric sender ID'],
  ])('rejects %s (%s)', async (value) => {
    const dto = Object.assign(new PhoneNumberDto(), { phoneNumber: value })
    const errors = await validate(dto)

    expect(errors[0].constraints?.isNormalizablePhoneNumber).toBe(
      `${value} is not a valid phone number`,
    )
  })

  it('supports each:true and identifies invalid array entries', async () => {
    const dto = Object.assign(new PhoneNumbersDto(), {
      phoneNumbers: ['250-555-1234', '12345'],
    })
    const errors = await validate(dto)

    expect(errors[0].constraints?.isNormalizablePhoneNumber).toContain('phoneNumbers[1] ("12345")')
  })

  it('supports a custom validation message', async () => {
    class CustomMessageDto {
      @IsNormalizablePhoneNumber({ message: 'Use a resolvable phone number' })
      phoneNumber: string
    }

    const dto = Object.assign(new CustomMessageDto(), { phoneNumber: '12345' })
    const errors = await validate(dto)
    expect(errors[0].constraints?.isNormalizablePhoneNumber).toBe('Use a resolvable phone number')
  })
})
