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

/** Convert a rendered body to HTML. A `text` body is returned untouched, for the caller to escape. */
export function toEmailHtml(body: string, bodyType?: 'text' | 'markdown' | 'html'): string {
  return bodyType === 'markdown' ? markdown.render(body) : body
}
