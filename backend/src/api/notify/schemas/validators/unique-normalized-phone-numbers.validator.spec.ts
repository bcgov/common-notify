import { validate } from 'class-validator'
import { HasUniqueNormalizedPhoneNumbers } from './unique-normalized-phone-numbers.validator'

class PhoneNumbersDto {
  @HasUniqueNormalizedPhoneNumbers()
  phoneNumbers: string[]
}

describe('HasUniqueNormalizedPhoneNumbers', () => {
  it('accepts a list of distinct phone numbers', async () => {
    const dto = Object.assign(new PhoneNumbersDto(), {
      phoneNumbers: ['250-555-1234', '2505559999'],
    })
    expect(await validate(dto)).toHaveLength(0)
  })

  it('accepts an empty list', async () => {
    const dto = Object.assign(new PhoneNumbersDto(), { phoneNumbers: [] })
    expect(await validate(dto)).toHaveLength(0)
  })

  it('rejects two entries that normalize to the same number', async () => {
    const dto = Object.assign(new PhoneNumbersDto(), {
      phoneNumbers: ['2505551234', '250-555-1234'],
    })
    const errors = await validate(dto)

    expect(errors[0].constraints?.hasUniqueNormalizedPhoneNumbers).toBe(
      'phoneNumbers[1] ("250-555-1234") is a duplicate of phoneNumbers[0] ("2505551234")',
    )
  })

  it('rejects an exact-string duplicate', async () => {
    const dto = Object.assign(new PhoneNumbersDto(), {
      phoneNumbers: ['2505551234', '2505551234'],
    })
    const errors = await validate(dto)

    expect(errors[0].constraints?.hasUniqueNormalizedPhoneNumbers).toContain('phoneNumbers[1]')
  })

  it('ignores unparseable entries, leaving IsNormalizablePhoneNumber to reject them', async () => {
    const dto = Object.assign(new PhoneNumbersDto(), {
      phoneNumbers: ['12345', '12345'],
    })
    expect(await validate(dto)).toHaveLength(0)
  })
})
