/**
 * SMS segmentation (GSM 03.38 / UCS-2).
 *
 * Carriers bill per SMS *segment*, not per message: anything over the single-segment budget is
 * split into concatenated parts and each part is charged as its own message. This powers the
 * live estimate under the SMS template body.
 *
 * Budgets:
 *   GSM-7  160 septets single, 153 per segment when concatenated
 *   UCS-2   70 units   single,  67 per segment when concatenated
 *
 * Encoding is decided by content: one character outside the GSM 03.38 alphabet (an emoji, a
 * curly quote) drops the whole message to UCS-2 and the budget from 160 to 70.
 *
 * NOTE: mirrored from backend/src/common/utils/sms-segments.ts, which does the billing count at
 * send time. The two implementations must stay in step; there is no shared package between the
 * workspaces.
 */

export type SmsEncoding = 'GSM_7BIT' | 'UCS_2'

export interface SmsSegmentation {
  encoding: SmsEncoding
  /** Unicode code points. An emoji is one character here but costs two UCS-2 units. */
  characters: number
  /** Billing units consumed: septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number
  /** Billable segments. Zero for an empty body. */
  segments: number
  /** Unit budget of each segment at this segment count (single vs concatenated). */
  unitsPerSegment: number
  /** Units still free in the final segment before a new one is started. */
  remainingInLastSegment: number
}

/** GSM 03.38 default alphabet, one septet each. 0x1B (ESC) is omitted: it is the escape marker. */
const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§' +
    '¿abcdefghijklmnopqrstuvwxyzäöñüà',
)

/** GSM 03.38 extension table: sent as ESC + char, so two septets each. */
const GSM7_EXTENDED = new Set('\f^{}\\[~]|€')

const GSM7_SINGLE = 160
const GSM7_CONCATENATED = 153
const UCS2_SINGLE = 70
const UCS2_CONCATENATED = 67

/**
 * Segment a message body the way a carrier would.
 */
export function segmentSms(body: string | null | undefined): SmsSegmentation {
  const characters = Array.from(body ?? '')

  const isGsm7 = characters.every((char) => GSM7_BASIC.has(char) || GSM7_EXTENDED.has(char))

  // Cost per character: escaped GSM characters take two septets; astral-plane characters
  // (emoji, and anything else outside the BMP) take two UTF-16 code units under UCS-2.
  const weights = isGsm7
    ? characters.map((char) => (GSM7_EXTENDED.has(char) ? 2 : 1))
    : characters.map((char) => char.length)

  return pack(
    weights,
    characters.length,
    isGsm7 ? 'GSM_7BIT' : 'UCS_2',
    isGsm7 ? GSM7_SINGLE : UCS2_SINGLE,
    isGsm7 ? GSM7_CONCATENATED : UCS2_CONCATENATED,
  )
}

/** Label for the encoding a message will be sent with. */
export function smsEncodingLabel(encoding: SmsEncoding): string {
  return encoding === 'GSM_7BIT' ? 'GSM-7' : 'Unicode (UCS-2)'
}

/**
 * Fill segments greedily. A character is never split across a boundary, so a two-unit
 * character (escaped GSM character, or a surrogate pair) that will not fit starts the next
 * segment and leaves one unit of the previous segment unused — the same thing the encoder does.
 */
function pack(
  weights: number[],
  characters: number,
  encoding: SmsEncoding,
  singleBudget: number,
  concatenatedBudget: number,
): SmsSegmentation {
  const units = weights.reduce((total, weight) => total + weight, 0)

  if (units === 0) {
    return {
      encoding,
      characters,
      units,
      segments: 0,
      unitsPerSegment: singleBudget,
      remainingInLastSegment: singleBudget,
    }
  }

  if (units <= singleBudget) {
    return {
      encoding,
      characters,
      units,
      segments: 1,
      unitsPerSegment: singleBudget,
      remainingInLastSegment: singleBudget - units,
    }
  }

  let segments = 1
  let usedInSegment = 0
  for (const weight of weights) {
    if (usedInSegment + weight > concatenatedBudget) {
      segments += 1
      usedInSegment = 0
    }
    usedInSegment += weight
  }

  return {
    encoding,
    characters,
    units,
    segments,
    unitsPerSegment: concatenatedBudget,
    remainingInLastSegment: concatenatedBudget - usedInSegment,
  }
}
