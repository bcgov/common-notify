import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmailBodyFrame from './EmailBodyFrame'

describe('EmailBodyFrame', () => {
  it('shows the email in a frame that runs no script', () => {
    render(<EmailBodyFrame html="<p>Hello Molly</p>" />)

    const frame = screen.getByTitle('Rendered email')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin')
    expect(frame.getAttribute('srcdoc')).toContain('<p>Hello Molly</p>')
  })

  it('keeps tenant-authored markup out of the page', () => {
    const { container } = render(
      <EmailBodyFrame html={'<style>body{display:none}</style><img src="x" onerror="alert(1)">'} />,
    )

    expect(container.querySelector('style')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('takes a title for pages that show more than one email', () => {
    render(<EmailBodyFrame html="<p>Hi</p>" title="Email for row 2" />)

    expect(screen.getByTitle('Email for row 2')).toBeInTheDocument()
  })
})
