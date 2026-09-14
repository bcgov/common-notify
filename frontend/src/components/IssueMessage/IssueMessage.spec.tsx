import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import IssueMessage from './IssueMessage'

describe('IssueMessage', () => {
  it('shows the title and emphasises it', () => {
    render(<IssueMessage title="Invalid format" />)

    const title = screen.getByText('Invalid format')
    expect(title).toBeInTheDocument()
    expect(title.tagName).toBe('STRONG')
  })

  it('shows the detail under the title without being asked', () => {
    render(
      <IssueMessage
        title="Invalid format"
        detail="Use a single @ with a domain after it, like name@example.com."
      />,
    )

    expect(
      screen.getByText('Use a single @ with a domain after it, like name@example.com.'),
    ).toBeInTheDocument()
  })

  it('renders the title alone when there is no detail', () => {
    const { container } = render(<IssueMessage title="Invalid format" />)

    expect(container.querySelector('.issue-message__detail')).not.toBeInTheDocument()
  })
})
