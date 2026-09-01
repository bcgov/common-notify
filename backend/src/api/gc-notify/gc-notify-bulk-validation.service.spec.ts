import { PhoneNumberService } from '../notify/services/phone-number.service'
import { GcNotifyBulkValidationService } from './gc-notify-bulk-validation.service'

describe('GcNotifyBulkValidationService', () => {
  const service = new GcNotifyBulkValidationService(new PhoneNumberService())

  it('passes rows whose SMS recipients are all valid E.164 numbers', () => {
    expect(
      service.validateRows([
        ['phone number', 'name'],
        ['+12505551234', 'Alice'],
        ['+491512345678901', 'Bob'],
      ]),
    ).toEqual({ valid: true, errors: [] })
  })

  it('accepts a normalizable non-canonical SMS recipient', () => {
    expect(
      service.validateRows([
        ['phone number', 'name'],
        ['250-555-1234', 'Alice'],
      ]),
    ).toEqual({ valid: true, errors: [] })
  })

  it('reports one invalid recipient with its data-row number and value', () => {
    expect(
      service.validateRows([
        ['phone number', 'name'],
        ['+12505551234', 'Alice'],
        ['12345', 'Bob'],
      ]),
    ).toEqual({
      valid: false,
      errors: ['Row 2: "12345" is not a valid E.164 phone number'],
    })
  })

  it('reports every invalid recipient and follows the header-defined column order', () => {
    expect(
      service.validateRows([
        ['name', 'phone number'],
        ['Alice', '12345'],
        ['Bob', '+12505551234'],
        ['Carol', 'not-a-number'],
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'Row 1: "12345" is not a valid E.164 phone number',
        'Row 3: "not-a-number" is not a valid E.164 phone number',
      ],
    })
  })

  it('never validates the header as a recipient', () => {
    expect(service.validateRows([['phone number'], ['+12505551234']])).toEqual({
      valid: true,
      errors: [],
    })
  })

  it.each([
    [[['phone number'], []], 'Row 1: "" is not a valid E.164 phone number'],
    [
      [['phone number'], undefined as unknown as string[]],
      'Row 1: "" is not a valid E.164 phone number',
    ],
  ])('handles malformed row data without throwing', (rows, expectedError) => {
    expect(service.validateRows(rows)).toEqual({ valid: false, errors: [expectedError] })
  })

  it('rejects rows when the header has no recognizable phone-number column', () => {
    expect(
      service.validateRows([
        ['mobile', 'name'],
        ['+12505551234', 'Alice'],
      ]),
    ).toEqual({
      valid: false,
      errors: ['A phone number column could not be identified in the header row'],
    })
  })

  it('does not apply phone validation to an email bulk header', () => {
    expect(
      service.validateRows([
        ['email address', 'name'],
        ['alice@example.com', 'Alice'],
      ]),
    ).toEqual({ valid: true, errors: [] })
  })
})
