import { describe, it, expect, beforeEach } from 'vitest'
import { GcNotifyNativeTemplateRenderer } from './gc-notify-native-template.renderer'

describe('GcNotifyNativeTemplateRenderer', () => {
  let renderer: GcNotifyNativeTemplateRenderer

  beforeEach(() => {
    renderer = new GcNotifyNativeTemplateRenderer()
  })

  const email = (body: string, personalisation: Record<string, unknown> = {}) =>
    renderer.renderEmail({
      template: { body, subject: 'Subject' },
      personalisation,
    } as never)

  const sms = (body: string, personalisation: Record<string, unknown> = {}) =>
    renderer.renderSms({ template: { body }, personalisation } as never)

  describe('placeholders', () => {
    it('substitutes an ordinary placeholder', async () => {
      expect((await email('Hello ((name))', { name: 'Alice' })).body).toBe('Hello Alice')
    })

    it('renders (((colour))) as (blue) rather than breaking on the extra parenthesis', async () => {
      expect((await email('(((colour)))', { colour: 'blue' })).body).toBe('(blue)')
    })

    it('leaves an unknown placeholder in place', async () => {
      expect((await email('Hello ((name))', {})).body).toBe('Hello ((name))')
    })
  })

  describe('placeholders inside a link URL', () => {
    it('substitutes the URL without disturbing the link syntax', async () => {
      const out = await email('[Click here](((link_url)))', { link_url: 'https://gov.bc.ca' })
      expect(out.body).toBe('[Click here](https://gov.bc.ca)')
    })

    it('leaves an unknown link URL placeholder in place', async () => {
      expect((await email('[Click here](((link_url)))', {})).body).toBe(
        '[Click here](((link_url)))',
      )
    })
  })

  describe('conditional truthiness is an exact list, not a truthiness test', () => {
    it.each([
      'yes',
      'y',
      'true',
      't',
      '1',
      'include',
      'show',
      'oui',
      'vrai',
      'inclure',
      'afficher',
    ])('treats %s as true', async (value) => {
      expect((await email('((flag??shown))', { flag: value })).body).toBe('shown')
    })

    it.each(['YES', 'True', 'Show'])('is case insensitive, so %s is true', async (value) => {
      expect((await email('((flag??shown))', { flag: value })).body).toBe('shown')
    })

    it.each([
      ['a trailing space', 'True '],
      ['on', 'on'],
      ['no', 'no'],
      ['false', 'false'],
      ['0', '0'],
      ['an empty string', ''],
    ])('treats %s as false', async (_label, value) => {
      expect((await email('((flag??shown))', { flag: value })).body).toBe('')
    })

    it('treats a missing key as false', async () => {
      expect((await email('((flag??shown))', {})).body).toBe('')
    })

    it('agrees between a JSON boolean and the string form', async () => {
      expect((await email('((flag??shown))', { flag: true })).body).toBe('shown')
      expect((await email('((flag??shown))', { flag: false })).body).toBe('')
    })
  })

  describe('multi-line conditional bodies', () => {
    it('keeps a single-line body inline in the surrounding sentence', async () => {
      const out = await email('Before ((flag??middle)) after', { flag: 'yes' })
      expect(out.body).toBe('Before middle after')
    })

    it('renders a multi-line body as a block so a list inside it survives', async () => {
      const out = await email('Before\n\n((flag??* one\n* two))\n\nAfter', { flag: 'yes' })

      expect(out.body).toContain('@@GCNOTIFYBLOCK:')
      expect(out.body).not.toContain('* one')
    })

    it('leaves an SMS conditional as plain text, since an SMS carries no markup', async () => {
      const out = await sms('((flag??line one\nline two))', { flag: 'yes' })

      expect(out.body).toBe('line one\nline two')
      expect(out.body).not.toContain('@@GCNOTIFYBLOCK:')
    })
  })

  describe('lists', () => {
    it('writes an array as bullets in an email body', async () => {
      const out = await email('((items))', { items: ['a', 'b'] })
      expect(out.body).toContain('* a')
      expect(out.body).toContain('* b')
    })

    it('writes an array inline in an SMS', async () => {
      expect((await sms('((items))', { items: ['a', 'b', 'c'] })).body).toBe('a, b and c')
    })

    it('writes an array inline in a subject', async () => {
      const out = await renderer.renderEmail({
        template: { subject: '((items))', body: 'x' },
        personalisation: { items: ['a', 'b'] },
      } as never)

      expect(out.subject).toBe('a and b')
    })
  })

  it('strips a block marker a caller put in the template, so only ours can be decoded', async () => {
    const smuggled =
      '@@GCNOTIFYBLOCK:' + Buffer.from('<script>x</script>').toString('base64') + '@@'
    const out = await email(`Hello ${smuggled}`, {})

    expect(out.body).not.toContain('GCNOTIFYBLOCK')
  })

  it('strips a block marker arriving through a personalisation value', async () => {
    const smuggled =
      '@@GCNOTIFYBLOCK:' + Buffer.from('<script>x</script>').toString('base64') + '@@'
    const out = await email('Hello ((name))', { name: smuggled })

    expect(out.body).not.toContain('GCNOTIFYBLOCK')
  })
})
