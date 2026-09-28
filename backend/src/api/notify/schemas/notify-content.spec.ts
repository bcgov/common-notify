import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { describe, it, expect } from 'vitest'
import { NotifyContent } from './notify-content'

const parse = (plain: Record<string, unknown>) => plainToInstance(NotifyContent, plain)

describe('NotifyContent body sanitisation', () => {
  const hostile = '<p>Hi</p><script>alert(1)</script>'

  it('sanitises an html body at the boundary, so what is stored is what is safe to send', () => {
    expect(parse({ body: hostile, bodyType: 'html' }).body).toBe('<p>Hi</p>')
  })

  it('leaves a markdown body alone - markdown-it escapes it at render time instead', () => {
    expect(parse({ body: hostile, bodyType: 'markdown' }).body).toBe(hostile)
  })

  it('leaves a text body alone', () => {
    expect(parse({ body: hostile, bodyType: 'text' }).body).toBe(hostile)
  })

  it('leaves a body alone when bodyType is omitted, since the default is markdown', () => {
    expect(parse({ body: hostile }).body).toBe(hostile)
  })

  it('does not trip over a non-string body', () => {
    expect(parse({ body: 42, bodyType: 'html' }).body).toBe(42 as unknown as string)
  })

  it('does not trip over a missing body on a template send', () => {
    expect(parse({ templateId: 'abc', bodyType: 'html' }).body).toBeUndefined()
  })
})
