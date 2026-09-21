import { Resvg } from '@resvg/resvg-js'
import * as path from 'path'
import { EMAIL_LOGO_PNG_WIDTH } from './email-logo.constants'

// Gmail and Outlook don't render SVG, so an SVG logo is served to mail clients as a PNG
// rendered from it. The width is part of the key: changing EMAIL_LOGO_PNG_WIDTH makes the
// seed render a fresh copy instead of skipping the old one as already present.
export function toEmailImageKey(fileKey: string): string {
  if (path.posix.extname(fileKey).toLowerCase() !== '.svg') {
    return fileKey
  }
  return `${fileKey.slice(0, -'.svg'.length)}-${EMAIL_LOGO_PNG_WIDTH}w.png`
}

export function rasterizeEmailLogo(svg: Buffer): Buffer {
  // The approved logos are outlined paths with no <text>, so system fonts aren't needed.
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: EMAIL_LOGO_PNG_WIDTH },
    font: { loadSystemFonts: false },
  })
  return resvg.render().asPng()
}
