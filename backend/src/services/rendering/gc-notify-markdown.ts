import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

/**
 * GC Notify's markdown dialect, for the GC Notify compatibility routes only.
 *
 * GC Notify does not render CommonMark. It renders a small subset with its own quirks, and a
 * template written against it produces different output under a standard renderer - headings sit
 * a level lower, `^` starts a quote rather than `>`, and a table silently disappears instead of
 * printing its pipes. The compatibility routes have to match GC Notify, not CommonMark, so this
 * module is theirs alone; `toEmailHtml` remains the renderer for every other route.
 *
 * Implemented as markdown-it rule overrides rather than a hand-written parser, so inline
 * precedence, list nesting and entity handling stay with a maintained implementation and only the
 * deliberate differences live here.
 */

/** Schemes an href may use. Anything else is replaced with `#` rather than dropped. */
const ALLOWED_LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:']

/** Inline style GC Notify puts on every link, since email has no stylesheet. */
const LINK_STYLE = 'word-wrap: break-word; color: #1a4480;'

/** C0/C1 controls and the spaces around them, removed before an href's scheme is read. */
// Matching control characters is the point here: they are what an obfuscated scheme hides in.
// eslint-disable-next-line no-control-regex
const STRIPPED_BEFORE_SCHEME_CHECK = new RegExp('[\\u0000-\\u0020\\u007f-\\u00a0]', 'g')

/**
 * `javascript:` written with embedded whitespace or control characters - " java\tscript:alert(1)"
 * - is still executed by some clients, so strip those before testing the scheme.
 */
const stripForSchemeCheck = (href: string): string =>
  href.replace(STRIPPED_BEFORE_SCHEME_CHECK, '').toLowerCase()

/**
 * An href is safe when it carries an allowed scheme, or no scheme at all - `example.com/path` is
 * schemeless and GC Notify passes it through untouched.
 */
export function safeHref(href: string): string {
  const stripped = stripForSchemeCheck(href)
  const scheme = stripped.match(/^[a-z][a-z0-9+.-]*:/)

  if (!scheme) {
    return href
  }

  return ALLOWED_LINK_SCHEMES.includes(scheme[0]) ? href : '#'
}

/**
 * GC Notify runs a typography pass over every body and subject, so output is not byte-identical
 * to input even with no placeholders.
 */
export function applyTypography(text: string): string {
  let out = text
    // Straight quotes to smart quotes. Openers are those following start-of-string or whitespace.
    .replace(/(^|[\s([{])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{])'/g, '$1‘')
    .replace(/'/g, '’')
    // A space-surrounded hyphen becomes an en dash.
    .replace(/ - /g, ' – ')
    // Whitespace before punctuation is removed.
    .replace(/\s+([,.;:!?])/g, '$1')

  // An email address must survive the apostrophe pass: o'brien@gov.bc.ca would otherwise carry a
  // right single quote and stop being a valid address.
  out = out.replace(/\S+@\S+\.\S+/g, (address) =>
    address.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'),
  )

  return out
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true, // a bare URL is autolinked
  breaks: true, // hard_wrap: a single newline becomes <br />
  typographer: false, // applyTypography does this, to GC Notify's rules rather than markdown-it's
})

// Tables render as an empty string. This is silent data loss, and it is what GC Notify does - an
// author who writes a table gets nothing rather than a broken table. Suppressing only the table
// tags is not enough: the cell contents are separate inline tokens and would survive as a run of
// unspaced text, so the whole token range is dropped before rendering.
markdown.enable('table')
markdown.core.ruler.push('gc_notify_drop_tables', (state) => {
  const kept: Token[] = []
  let depth = 0

  for (const token of state.tokens) {
    if (token.type === 'table_open') {
      depth += 1
    }
    if (depth === 0) {
      kept.push(token)
    }
    if (token.type === 'table_close') {
      depth -= 1
    }
  }

  state.tokens = kept
  return true
})

// markdown-it refuses to parse a link whose scheme it distrusts, which would leave
// `[Click](javascript:...)` on the page as literal markdown. GC Notify renders the link and
// replaces the href with `#`, so validation is handed to `safeHref` in the link_open rule below.
markdown.validateLink = () => true

/** Headings shift down a level: `#` is an h2, `##` an h3, and anything deeper is a paragraph. */
const HEADING_TAG: Record<string, string> = { h1: 'h2', h2: 'h3' }
const HEADING_STYLE: Record<string, string> = {
  h2: 'margin: 0 0 20px 0; font-size: 27px; line-height: 35px; font-weight: bold; color: #000;',
  h3: 'margin: 0 0 15px 0; font-size: 22px; line-height: 29px; font-weight: bold; color: #000;',
}

markdown.renderer.rules.heading_open = (tokens: Token[], idx: number) => {
  const tag = HEADING_TAG[tokens[idx].tag]
  if (!tag) {
    return '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #000;">'
  }
  return `<${tag} style="${HEADING_STYLE[tag]}">`
}

markdown.renderer.rules.heading_close = (tokens: Token[], idx: number) => {
  const tag = HEADING_TAG[tokens[idx].tag]
  return tag ? `</${tag}>` : '</p>'
}

/** Links carry an inline style, and an unsafe scheme is neutered rather than removed. */
markdown.renderer.rules.link_open = (tokens: Token[], idx: number) => {
  const href = tokens[idx].attrGet('href') ?? ''
  const escaped = markdown.utils.escapeHtml(safeHref(href))
  return `<a style="${LINK_STYLE}" href="${escaped}">`
}

/** An image renders as nothing at all. */
markdown.renderer.rules.image = () => ''

/** Code keeps its contents but loses its markup - no <code>, no monospace block. */
markdown.renderer.rules.code_inline = (tokens: Token[], idx: number) =>
  markdown.utils.escapeHtml(tokens[idx].content)
markdown.renderer.rules.code_block = (tokens: Token[], idx: number) =>
  markdown.utils.escapeHtml(tokens[idx].content)
markdown.renderer.rules.fence = (tokens: Token[], idx: number) =>
  markdown.utils.escapeHtml(tokens[idx].content)

/** Strikethrough emits its contents as plain text. */
markdown.renderer.rules.s_open = () => ''
markdown.renderer.rules.s_close = () => ''

/**
 * `^` is the quote marker, not `>`, and `•` is accepted as a bullet. Both are rewritten to the
 * markdown the parser understands, at line starts only so a `^` or `•` mid-sentence is literal.
 * A `>` at a line start is *not* a quote in GC Notify, so it is escaped to stay visible.
 */
function normaliseBlockMarkers(body: string): string {
  return body
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)>/, '$1\\>')
        .replace(/^(\s*)\^\s?/, '$1> ')
        .replace(/^(\s*)•\s+/, '$1* '),
    )
    .join('\n')
}

/**
 * Marker for a block of HTML this module produced earlier in the pipeline.
 *
 * A multi-line conditional body is rendered to HTML during placeholder substitution, but the
 * renderer interface passes only a string, and this renderer runs with `html: false` so a
 * personalisation value cannot smuggle markup in. The block is therefore carried as a base64
 * marker - opaque to markdown, containing no character markdown treats as syntax - and swapped
 * back for its HTML once the surrounding body has been rendered.
 */
const BLOCK_MARKER = 'GCNOTIFYBLOCK'
const BLOCK_MARKER_PATTERN = new RegExp(
  `(?:<p>\\s*)?@@${BLOCK_MARKER}:([A-Za-z0-9+/=]+)@@(?:\\s*</p>)?`,
  'g',
)

/** Wrap pre-rendered HTML as a block marker, surrounded by the blank lines that make it a block. */
export function encodeGcNotifyBlock(html: string): string {
  return `\n\n@@${BLOCK_MARKER}:${Buffer.from(html, 'utf8').toString('base64')}@@\n\n`
}

/**
 * Remove any marker the caller's own text happens to contain, so only markers this module wrote
 * can ever be decoded. Callers must apply this to the template body and to every personalisation
 * value *before* any real block is encoded - otherwise a caller could base64 arbitrary HTML into
 * a marker and have it decoded straight past `html: false`.
 */
export const stripGcNotifyBlockMarkers = (text: string): string =>
  text.replace(BLOCK_MARKER_PATTERN, '')

const restoreBlocks = (html: string): string =>
  html.replace(BLOCK_MARKER_PATTERN, (_match, encoded: string) =>
    Buffer.from(encoded, 'base64').toString('utf8'),
  )

/**
 * Render a GC Notify template body to the HTML a recipient receives.
 *
 * The typography pass runs on the source rather than the output so it cannot corrupt the tags or
 * attributes the renderer emits.
 */
export function toGcNotifyEmailHtml(body: string): string {
  if (!body) {
    return ''
  }

  return restoreBlocks(markdown.render(normaliseBlockMarkers(applyTypography(body))))
}

/**
 * Render a GC Notify subject line: escaped, collapsed to one line, and never markdown. The
 * typography pass applies here too.
 */
export function toGcNotifySubject(subject: string): string {
  if (!subject) {
    return ''
  }

  return markdown.utils.escapeHtml(
    stripGcNotifyBlockMarkers(applyTypography(subject)).replace(/\s+/g, ' ').trim(),
  )
}
