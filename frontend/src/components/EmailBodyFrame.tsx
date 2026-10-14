import { useEffect, useRef } from 'react'
import type { FC, SyntheticEvent } from 'react'
import '@/scss/components/email-body-frame.scss'

type EmailBodyFrameProps = {
  html: string
  title?: string
}

// Laid out at a fixed pixel width that the card may be narrower than, and spaced by the card.
const BASE_STYLES =
  'html,body{margin:0}body>:first-child{margin-top:0}body>:last-child{margin-bottom:0}' +
  'img,table{max-width:100%}img{height:auto}'

/**
 * A rendered email body, shown in line with the page and as tall as its content.
 *
 * Templates are tenant-authored, so the markup is framed rather than inlined: `allow-same-origin`
 * without `allow-scripts` runs no script or event handler and keeps the template's `<style>` out
 * of the app, while letting this component read the content height and copy the app's font in.
 */
const EmailBodyFrame: FC<EmailBodyFrameProps> = ({ html, title = 'Rendered email' }) => {
  const observerRef = useRef<ResizeObserver | null>(null)

  const handleLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    const frame = event.currentTarget
    const doc = frame.contentDocument
    if (!doc?.body) return

    const { font, color } = getComputedStyle(frame)
    doc.body.style.font = font
    doc.body.style.color = color

    // The root's box, not its scrollHeight: scrollHeight never drops below the frame's own
    // height, so the frame could grow but never shrink back.
    const fitToContent = () => {
      frame.style.height = `${Math.ceil(doc.documentElement.getBoundingClientRect().height)}px`
    }
    fitToContent()

    // The content reflows when the page width changes, and images size themselves after load.
    observerRef.current?.disconnect()
    if (typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(fitToContent)
      observerRef.current.observe(doc.documentElement)
    }
  }

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return (
    <iframe
      className="email-body-frame"
      title={title}
      sandbox="allow-same-origin"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head><body>${html}</body></html>`}
      onLoad={handleLoad}
    />
  )
}

export default EmailBodyFrame
