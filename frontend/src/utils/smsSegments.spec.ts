import { describe, it, expect } from 'vitest'
import { segmentSms, smsEncodingLabel } from './smsSegments'

describe('segmentSms', () => {
  describe('GSM-7', () => {
    it('treats an empty body as zero segments', () => {
      expect(segmentSms('')).toMatchObject({ segments: 0, units: 0, characters: 0 })
      expect(segmentSms(undefined)).toMatchObject({ segments: 0 })
    })

    it('fits 160 characters in a single segment', () => {
      expect(segmentSms('a'.repeat(160))).toMatchObject({
        encoding: 'GSM_7BIT',
        characters: 160,
        units: 160,
        segments: 1,
        remainingInLastSegment: 0,
      })
    })

    it('splits at 161 characters into 153-septet segments', () => {
      expect(segmentSms('a'.repeat(161))).toMatchObject({ segments: 2, unitsPerSegment: 153 })
      expect(segmentSms('a'.repeat(306)).segments).toBe(2)
      expect(segmentSms('a'.repeat(307)).segments).toBe(3)
    })

    it('charges escaped extension characters two septets each', () => {
      expect(segmentSms('€'.repeat(80))).toMatchObject({ characters: 80, units: 160, segments: 1 })
      expect(segmentSms('€'.repeat(81)).segments).toBe(2)
    })

    it('never splits an escaped character across a segment boundary', () => {
      expect(segmentSms('a'.repeat(152) + '€' + 'a'.repeat(152))).toMatchObject({
        units: 306,
        segments: 3,
      })
    })

    it('accepts the full GSM default alphabet', () => {
      expect(segmentSms('Hello à ¿ Ω £¥§ Ä').encoding).toBe('GSM_7BIT')
    })
  })

  describe('UCS-2', () => {
    it('drops to UCS-2 for characters outside the GSM alphabet', () => {
      expect(segmentSms('It’s here')).toMatchObject({ encoding: 'UCS_2', unitsPerSegment: 70 })
    })

    it('fits 70 units in a single segment and splits at 71', () => {
      expect(segmentSms('☺'.repeat(70))).toMatchObject({ segments: 1, units: 70 })
      expect(segmentSms('☺'.repeat(71))).toMatchObject({ segments: 2, unitsPerSegment: 67 })
    })

    it('charges emoji two units each because they are surrogate pairs', () => {
      expect(segmentSms('🎉'.repeat(35))).toMatchObject({ characters: 35, units: 70, segments: 1 })
      expect(segmentSms('🎉'.repeat(36)).segments).toBe(2)
    })

    it('never splits a surrogate pair across a segment boundary', () => {
      expect(segmentSms('☺'.repeat(66) + '🎉' + '☺'.repeat(66))).toMatchObject({
        units: 134,
        segments: 3,
      })
    })
  })
})

describe('smsEncodingLabel', () => {
  it('labels both encodings', () => {
    expect(smsEncodingLabel('GSM_7BIT')).toBe('GSM-7')
    expect(smsEncodingLabel('UCS_2')).toBe('Unicode (UCS-2)')
  })
})
