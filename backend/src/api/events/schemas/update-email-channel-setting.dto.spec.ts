import { describe, expect, it } from 'vitest'
import { validate } from 'class-validator'
import { UpdateEmailChannelSettingDto } from './update-email-channel-setting.dto'

describe('event CSTAR group limits', () => {
  it.each(['cstarGroupIdsTo', 'cstarGroupIdsCc', 'cstarGroupIdsBcc'])(
    'accepts 100 groups and rejects 101 in %s before the event is saved',
    async (field) => {
      const input = new UpdateEmailChannelSettingDto()
      Object.assign(input, { [field]: Array.from({ length: 100 }, (_, i) => `group-${i}`) })
      expect((await validate(input)).filter((error) => error.property === field)).toEqual([])
      Object.assign(input, { [field]: Array.from({ length: 101 }, (_, i) => `group-${i}`) })
      expect(
        (await validate(input)).find((error) => error.property === field)?.constraints,
      ).toHaveProperty('arrayMaxSize')
    },
  )
})
