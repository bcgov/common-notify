import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert } from './Alert'

describe('Alert', () => {
  it('defaults to the info variant announced politely', () => {
    render(<Alert>Heads up</Alert>)

    const alert = screen.getByRole('status')
    expect(alert).toHaveTextContent('Heads up')
    expect(alert).toHaveClass('alert', 'alert-info')
  })

  it('uses the assertive alert role for errors', () => {
    render(<Alert variant="danger">Something broke</Alert>)

    expect(screen.getByRole('alert')).toHaveClass('alert-danger')
  })

  it('lets the caller override the role', () => {
    render(
      <Alert variant="danger" role="status">
        Quietly
      </Alert>,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('appends caller classes without dropping the variant', () => {
    render(<Alert variant="warning" className="mb-3" />)

    expect(screen.getByRole('status')).toHaveClass('alert', 'alert-warning', 'mb-3')
  })
})
