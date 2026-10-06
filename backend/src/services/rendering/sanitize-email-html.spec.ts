import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from './sanitize-email-html'

describe('sanitizeEmailHtml', () => {
  describe('removes what a mail client would still render', () => {
    it('drops script tags and their contents', () => {
      const out = sanitizeEmailHtml('<p>Hi</p><script>alert(1)</script>')
      expect(out).toBe('<p>Hi</p>')
    })

    it('drops event handler attributes', () => {
      const out = sanitizeEmailHtml('<img src="https://x.ca/a.png" onerror="alert(1)">')
      expect(out).not.toContain('onerror')
      expect(out).toContain('src="https://x.ca/a.png"')
    })

    it('drops form elements that would ask the recipient for input', () => {
      const out = sanitizeEmailHtml(
        '<form action="https://evil.example"><input name="password"><button>Go</button></form>',
      )
      expect(out).not.toMatch(/<form|<input|<button/)
    })

    it('drops embedded frames and objects', () => {
      const out = sanitizeEmailHtml('<iframe src="https://evil.example"></iframe><object></object>')
      expect(out).not.toMatch(/<iframe|<object/)
    })

    it('drops style tags, which can restyle the whole message', () => {
      const out = sanitizeEmailHtml('<style>body{display:none}</style><p>Hi</p>')
      expect(out).toBe('<p>Hi</p>')
    })

    it('drops javascript: hrefs but keeps the link text', () => {
      const out = sanitizeEmailHtml('<a href="javascript:alert(1)">Click</a>')
      expect(out).not.toContain('javascript:')
      expect(out).toContain('Click')
    })

    it('drops protocol-relative hrefs', () => {
      const out = sanitizeEmailHtml('<a href="//evil.example">Click</a>')
      expect(out).not.toContain('//evil.example')
    })
  })

  describe('removes styles that hide content from the reader', () => {
    it.each(['display:none', 'visibility:hidden', 'opacity:0', 'position:absolute'])(
      'strips %s',
      (decl) => {
        const out = sanitizeEmailHtml(`<div style="${decl}">hidden</div>`)
        expect(out).not.toContain(decl.split(':')[0] + ':')
      },
    )

    it('keeps display values other than none, so layout still works', () => {
      const out = sanitizeEmailHtml('<div style="display:inline-block">x</div>')
      expect(out).toContain('display:inline-block')
    })
  })

  describe('keeps what an email actually needs', () => {
    it('keeps formatting and links', () => {
      const out = sanitizeEmailHtml(
        '<p><strong>Hi</strong> <a href="https://gov.bc.ca">here</a></p>',
      )
      expect(out).toContain('<strong>Hi</strong>')
      expect(out).toContain('href="https://gov.bc.ca"')
    })

    it('keeps table layout with its presentational attributes', () => {
      const out = sanitizeEmailHtml(
        '<table cellpadding="0" cellspacing="0" width="600"><tr><td align="center">x</td></tr></table>',
      )
      expect(out).toContain('cellpadding="0"')
      expect(out).toContain('width="600"')
      expect(out).toContain('align="center"')
    })

    it('keeps inline styles, which are the only styling an email has', () => {
      const out = sanitizeEmailHtml('<td style="color:#234075;font-size:16px;padding:8px">x</td>')
      expect(out).toContain('color:#234075')
      expect(out).toContain('font-size:16px')
      expect(out).toContain('padding:8px')
    })

    it('keeps images, including cid references to attachments', () => {
      expect(sanitizeEmailHtml('<img src="cid:logo" alt="Logo">')).toContain('src="cid:logo"')
      expect(sanitizeEmailHtml('<img src="https://x.ca/a.png" alt="A">')).toContain('alt="A"')
    })
  })

  it('neutralises markup injected through a triple-stache personalisation value', () => {
    // What Handlebars leaves live on the html path; the markdown path gets this from markdown-it.
    const injected = '<p>Hello <img src=x onerror=alert(1)><div style="display:none">x</div></p>'
    const out = sanitizeEmailHtml(injected)

    expect(out).not.toContain('onerror')
    expect(out).not.toContain('display:none')
  })

  it('leaves a body with nothing to remove untouched', () => {
    const clean = '<p>Your application has been received.</p>'
    expect(sanitizeEmailHtml(clean)).toBe(clean)
  })
})
