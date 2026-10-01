import MarkdownIt from 'markdown-it'

/**
 * Turns a rendered template body into the HTML a recipient actually receives.
 *
 * Shared by the CHES transport and the preview endpoints so a preview cannot drift from what is
 * sent. `html: false` keeps raw tags in a markdown body inert, which is what stops a template
 * author injecting markup through personalisation values.
 */
const markdown = new MarkdownIt({
  html: false,
  linkify: true, // converts urls and links to clickable links
  typographer: true, // enables smart quotes and other typographic replacements
})

/**
 * Convert a rendered body to HTML.
 *
 * Markdown is the default: an omitted `bodyType` reaches here only from inline API content that
 * did not set one, and the API documents markdown as its default. `text` is returned untouched
 * for the caller to escape, and `html` is the caller's own markup, gated by the
 * `html_body_type` feature flag and delivered unchanged.
 */
export function toEmailHtml(body: string, bodyType?: 'text' | 'markdown' | 'html'): string {
  return bodyType === 'text' || bodyType === 'html' ? body : markdown.render(body)
}
