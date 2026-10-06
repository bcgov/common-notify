import sanitizeHtml from 'sanitize-html'

/**
 * Sanitiser policy for a caller-supplied `bodyType: "html"` body.
 *
 * Built as a delta from `sanitize-html`'s own defaults rather than as a list of our own. The
 * default tag list is maintained upstream and already excludes `script`, `style`, `iframe`,
 * `object`, `embed` and every form element, so this file only has to say what email needs that a
 * web page does not - and each difference carries its reason.
 */

/**
 * Tags email needs that the default list omits.
 *
 * `img` is absent from the defaults but an email without images is not much of an email. `center`,
 * `font` and `strike` are deprecated in HTML and still routine in email, because mail clients
 * render a 1999 document more reliably than a modern one.
 */
const EMAIL_EXTRA_TAGS = ['img', 'center', 'font', 'strike']

/**
 * Presentational attributes email lays out with. The defaults allow almost none, because on a web
 * page these belong in CSS; in email there is no stylesheet to put them in.
 */
const TABLE_LAYOUT_ATTRIBUTES = [
  'width',
  'height',
  'align',
  'valign',
  'bgcolor',
  'border',
  'cellpadding',
  'cellspacing',
  'colspan',
  'rowspan',
  'style',
]

/**
 * Inline style properties a caller may keep.
 *
 * This part is ours and cannot come from a library: no general-purpose sanitiser knows that email
 * needs `style` attributes to lay out at all, but must not be able to hide content from the
 * reader. Properties are allowlisted, so anything omitted - `visibility`, `opacity`, `position` -
 * is dropped.
 */
const PRESENTATION_ONLY_STYLES: Record<string, RegExp[]> = Object.fromEntries(
  [
    'color',
    'background-color',
    'background',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'text-align',
    'text-decoration',
    'text-transform',
    'letter-spacing',
    'white-space',
    'vertical-align',
    'margin',
    'margin-top',
    'margin-bottom',
    'margin-left',
    'margin-right',
    'padding',
    'padding-top',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'border',
    'border-top',
    'border-bottom',
    'border-left',
    'border-right',
    'border-color',
    'border-radius',
    'border-collapse',
    'width',
    'max-width',
    'min-width',
    'height',
    'max-height',
  ].map((property) => [property, [/^.*$/]]),
)

// Anything but `none`, so a layout can still set block/inline-block/table without being able to
// hide text from the reader while leaving it in the message.
PRESENTATION_ONLY_STYLES.display = [/^(?!\s*none\s*$).*$/i]

/**
 * Removes markup a caller has no business sending from an inline `bodyType: "html"` body.
 *
 * Applied only to caller-supplied HTML, at the API boundary. Our own generated HTML - the email
 * layout wrapper, MJML output, and the GC Notify renderer - never passes through here: all are
 * trusted, and all use markup this policy would strip.
 *
 * Mail clients already refuse to run scripts, so this is not primarily an XSS control. It closes
 * the things a client will happily render: hidden text for filter evasion or preview-line
 * spoofing, `javascript:` hrefs, and form elements that ask a recipient for input inside the
 * message. It also catches markup that reached the body through a `{{{triple-stache}}}`
 * personalisation value, which Handlebars does not escape - the markdown path gets that for free
 * from markdown-it's `html: false`, and this is the equivalent guarantee for HTML bodies.
 */
export function sanitizeEmailHtml(body: string): string {
  return sanitizeHtml(body, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, ...EMAIL_EXTRA_TAGS],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: [...(sanitizeHtml.defaults.allowedAttributes.a ?? []), 'rel', 'title', 'style'],
      img: [...(sanitizeHtml.defaults.allowedAttributes.img ?? []), 'style'],
      table: TABLE_LAYOUT_ATTRIBUTES,
      td: TABLE_LAYOUT_ATTRIBUTES,
      th: TABLE_LAYOUT_ATTRIBUTES,
      tr: TABLE_LAYOUT_ATTRIBUTES,
      col: ['width', 'span', 'style'],
      font: ['color', 'face', 'size'],
      '*': ['style', 'align', 'dir', 'lang', 'title'],
    },
    allowedStyles: { '*': PRESENTATION_ONLY_STYLES },
    // The defaults allow `ftp`, which has no place in an email link. `cid:` is how an attached
    // image is referenced from the body; `data:` is inline and cannot phone home, unlike a remote
    // image. Everything unlisted, `javascript:` included, is dropped.
    allowedSchemes: sanitizeHtml.defaults.allowedSchemes.filter((scheme) => scheme !== 'ftp'),
    allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    // A relative href has no meaning in an email and is the shape a protocol-relative bypass
    // takes, so require an absolute URL.
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    // Discard these tags *with* their contents. Without `title` and `head`, a caller that posts a
    // whole HTML document has its document title dropped into the visible body - the tag goes, the
    // text stays. The rest are sanitize-html's own defaults for this option.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'head', 'title'],
  })
}
