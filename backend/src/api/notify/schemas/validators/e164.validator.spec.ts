import { validate } from 'class-validator'
import { IsE164 } from './e164.validator'

class PhoneNumberDto {
  @IsE164()
  phoneNumber: string
}

class PhoneNumbersDto {
  @IsE164({ each: true })
  phoneNumbers: string[]
}

describe('IsE164', () => {
  it.each(['+12505551234', '+491512345678901'])(
    'accepts canonical E.164 number %s',
    async (value) => {
      const dto = Object.assign(new PhoneNumberDto(), { phoneNumber: value })
      expect(await validate(dto)).toHaveLength(0)
    },
  )

  it.each([
    '12505551234',
    '+02505551234',
    '+1 2505551234',
    '+1-250-555-1234',
    '+12505551234 ext. 9',
    '',
    'not-a-number',
    '12345',
    '123456',
    'BCNOTIFY',
  ])('rejects non-canonical recipient value %j', async (value) => {
    const dto = Object.assign(new PhoneNumberDto(), { phoneNumber: value })
    const errors = await validate(dto)

    expect(errors).toHaveLength(1)
    expect(errors[0].constraints?.isE164).toBe(`${value} is not a valid E.164 phone number`)
  })

  it('validates array elements and identifies each invalid index and value', async () => {
    const dto = Object.assign(new PhoneNumbersDto(), {
      phoneNumbers: ['+12505551234', '250-555-1234', '12345'],
    })
    const errors = await validate(dto)

    expect(errors).toHaveLength(1)
    expect(errors[0].constraints?.isE164).toContain('phoneNumbers[1] ("250-555-1234")')
    expect(errors[0].constraints?.isE164).toContain('phoneNumbers[2] ("12345")')
  })

  it('supports a custom validation message', async () => {
    class CustomMessageDto {
      @IsE164({ message: 'Use canonical E.164' })
      phoneNumber: string
    }

    const dto = Object.assign(new CustomMessageDto(), { phoneNumber: '2505551234' })
    const errors = await validate(dto)

    expect(errors[0].constraints?.isE164).toBe('Use canonical E.164')
  })
})
