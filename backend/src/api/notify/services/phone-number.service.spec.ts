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
