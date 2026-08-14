import { describe, it, expect } from 'vitest'
import { countSmsSegments, segmentSms } from './sms-segments'

describe('segmentSms', () => {
  describe('GSM-7', () => {
    it('treats an empty body as zero segments', () => {
      expect(segmentSms('')).toMatchObject({ segments: 0, units: 0, characters: 0 })
      expect(segmentSms(undefined)).toMatchObject({ segments: 0 })
    })

    it('fits 160 characters in a single segment', () => {
      const result = segmentSms('a'.repeat(160))
      expect(result).toMatchObject({
        encoding: 'GSM_7BIT',
        characters: 160,
        units: 160,
        segments: 1,
        remainingInLastSegment: 0,
      })
    })

    it('splits at 161 characters into two 153-septet segments', () => {
      const result = segmentSms('a'.repeat(161))
      expect(result).toMatchObject({ segments: 2, units: 161, unitsPerSegment: 153 })
    })

    it('counts 306 characters as two segments and 307 as three', () => {
      expect(segmentSms('a'.repeat(306)).segments).toBe(2)
      expect(segmentSms('a'.repeat(307)).segments).toBe(3)
    })

    it('charges escaped extension characters two septets each', () => {
      // 80 euro signs = 160 septets, still one segment.
      expect(segmentSms('€'.repeat(80))).toMatchObject({
        encoding: 'GSM_7BIT',
        characters: 80,
        units: 160,
        segments: 1,
      })
      // 81 tips it over the single-segment budget.
      expect(segmentSms('€'.repeat(81)).segments).toBe(2)
    })

    it('never splits an escaped character across a segment boundary', () => {
      // 152 plain characters fill all but one septet of the first segment; the two-septet
      // euro cannot straddle the boundary, so it starts segment two.
      const result = segmentSms('a'.repeat(152) + '€' + 'a'.repeat(152))
      expect(result.units).toBe(306)
      expect(result.segments).toBe(3)
    })

    it('accepts the full GSM default alphabet without falling back to UCS-2', () => {
      expect(segmentSms('Hello à ¿ Ω £¥§ Ä').encoding).toBe('GSM_7BIT')
      expect(segmentSms('line one\nline two\r').encoding).toBe('GSM_7BIT')
    })
  })

  describe('UCS-2', () => {
    it('drops to UCS-2 when any character is outside the GSM alphabet', () => {
      // A curly apostrophe is not in GSM 03.38.
      const result = segmentSms('It’s here')
      expect(result).toMatchObject({ encoding: 'UCS_2', segments: 1, unitsPerSegment: 70 })
    })

    it('fits 70 units in a single segment and splits at 71', () => {
      expect(segmentSms('☺'.repeat(70))).toMatchObject({ segments: 1, units: 70 })
      expect(segmentSms('☺'.repeat(71))).toMatchObject({ segments: 2, unitsPerSegment: 67 })
    })

    it('charges emoji two units each because they are surrogate pairs', () => {
      const result = segmentSms('🎉'.repeat(35))
      expect(result).toMatchObject({ encoding: 'UCS_2', characters: 35, units: 70, segments: 1 })
      expect(segmentSms('🎉'.repeat(36)).segments).toBe(2)
    })

    it('never splits a surrogate pair across a segment boundary', () => {
      // 67 plain UCS-2 characters fill segment one exactly; a leading emoji makes the
      // 67th slot unusable for the pair, pushing it into the next segment.
      const result = segmentSms('☺'.repeat(66) + '🎉' + '☺'.repeat(66))
      expect(result.units).toBe(134)
      expect(result.segments).toBe(3)
    })

    it('reports code points as characters, not UTF-16 units', () => {
      expect(segmentSms('🎉').characters).toBe(1)
      expect(segmentSms('🎉').units).toBe(2)
    })
  })
})

describe('countSmsSegments', () => {
  it('bills an empty body as one segment so a send always costs something', () => {
    expect(countSmsSegments('')).toBe(1)
    expect(countSmsSegments(undefined)).toBe(1)
  })

  it('bills a long body as its segment count', () => {
    expect(countSmsSegments('a'.repeat(400))).toBe(3)
  })
})
