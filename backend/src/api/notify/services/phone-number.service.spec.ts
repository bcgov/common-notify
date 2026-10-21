import { PhoneNumberService } from './phone-number.service'

describe('PhoneNumberService', () => {
  const service = new PhoneNumberService()

  describe('normalize', () => {
    it.each([
      ['250-555-1234', '+12505551234'],
      ['(250) 555-1234', '+12505551234'],
      ['+1 250-555-1234', '+12505551234'],
    ])('normalizes formatted phone number %s to E.164', (input, expected) => {
      expect(service.normalize(input)).toBe(expected)
    })

    it('uses the supplied default region for a national number', () => {
      expect(service.normalize('020 7946 0018', 'GB')).toBe('+442079460018')
    })

    it('returns null when no country code or resolvable region is available', () => {
      expect(service.normalize('2505551234', 'ZZ')).toBeNull()
    })

    it.each([
      ['', 'an empty string'],
      ['not-a-number', 'non-numeric input'],
      ['12345', 'a five-digit short code'],
      ['123456', 'a six-digit short code'],
      ['BCNOTIFY', 'an alphanumeric sender ID'],
      ['+12505551234 ext. 9', 'an extension suffix'],
    ])('returns null for %s (%s)', (input) => {
      expect(service.normalize(input)).toBeNull()
    })
  })

  describe('isInternational', () => {
    it.each([
      ['+16045551234', 'a Canadian number'],
      ['604-555-1234', 'a national Canadian number'],
    ])('treats %s (%s) as domestic', (input) => {
      expect(service.isInternational(input)).toBe(false)
    })

    it.each([
      ['+12065550123', 'a US number'],
      ['+18005551234', 'a toll-free number, which libphonenumber assigns to the US'],
      ['+17875551234', 'Puerto Rico, which shares +1'],
      ['+18765551234', 'Jamaica, which shares +1'],
      ['+442071838750', 'the UK'],
    ])('treats %s (%s) as international', (input) => {
      expect(service.isInternational(input)).toBe(true)
    })

    it('leaves a number that will not parse to format validation', () => {
      expect(service.isInternational('not-a-number')).toBe(false)
    })
  })

  describe('isValid', () => {
    it.each(['+12505551234', '+491512345678901'])('accepts canonical E.164 number %s', (input) => {
      expect(service.isValid(input)).toBe(true)
    })

    it('rejects a missing plus prefix', () => {
      expect(service.isValid('12505551234')).toBe(false)
    })

    it('rejects a leading zero after the plus', () => {
      expect(service.isValid('+02505551234')).toBe(false)
    })

    it.each(['+1 2505551234', '+1-250-555-1234'])(
      'rejects unnormalized formatting even though normalize accepts it: %s',
      (input) => {
        expect(service.normalize(input)).toBe('+12505551234')
        expect(service.isValid(input)).toBe(false)
      },
    )

    it.each(['', 'not-a-number', '12345', '123456', 'BCNOTIFY', '+12505551234 ext. 9'])(
      'rejects non-recipient value %j',
      (input) => {
        expect(service.isValid(input)).toBe(false)
      },
    )
  })
})
