import { describe, it, expect } from 'vitest'
import { toEmailHtml } from './email-body-html'

describe('toEmailHtml', () => {
  it('renders a markdown body', () => {
    expect(toEmailHtml('# Hello', 'markdown')).toContain('<h1>Hello</h1>')
  })

  it('treats an omitted bodyType as markdown, matching the documented API default', () => {
    expect(toEmailHtml('# Hello', undefined)).toContain('<h1>Hello</h1>')
  })

  it('returns a text body untouched for the caller to escape', () => {
    expect(toEmailHtml('# Hello', 'text')).toBe('# Hello')
  })

  it("returns an html body unchanged so a flagged caller's markup survives", () => {
    expect(toEmailHtml('<h1>Hello</h1>', 'html')).toBe('<h1>Hello</h1>')
  })

  it('escapes raw tags in a markdown body so personalisation cannot inject markup', () => {
    expect(toEmailHtml('<script>alert(1)</script>', 'markdown')).not.toContain('<script>')
  })

  it('escapes raw tags when bodyType is omitted, same as an explicit markdown body', () => {
    expect(toEmailHtml('<script>alert(1)</script>', undefined)).not.toContain('<script>')
  })

  it('renders a single newline as a line break', () => {
    expect(toEmailHtml('**Ref:** 123\n**Status:** Approved', 'markdown')).toContain(
      '<strong>Ref:</strong> 123<br>\n<strong>Status:</strong> Approved',
    )
  })

  it('still starts a new paragraph at a blank line', () => {
    expect(toEmailHtml('One\n\nTwo', 'markdown')).toBe('<p>One</p>\n<p>Two</p>\n')
  })

  it('does not treat a bare # without a space as a heading', () => {
    expect(toEmailHtml('#Hello', 'markdown')).toContain('#Hello')
    expect(toEmailHtml('#Hello', 'markdown')).not.toContain('<h1>')
  })
})
