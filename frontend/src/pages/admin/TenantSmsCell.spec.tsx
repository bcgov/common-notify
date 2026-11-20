import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import TenantSmsCell from './TenantSmsCell'

describe('TenantSmsCell', () => {
  it('shows SMS enabled on the default number when none is assigned', () => {
    render(<TenantSmsCell smsEnabled smsFromNumber={null} />)

    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('Default number')).toBeInTheDocument()
  })

  it('shows the assigned number', () => {
    render(<TenantSmsCell smsEnabled smsFromNumber="+15814360804" />)

    expect(screen.getByText('+15814360804')).toBeInTheDocument()
    expect(screen.queryByText('Default number')).not.toBeInTheDocument()
  })

  it('still shows an assigned number while SMS is disabled', () => {
    render(<TenantSmsCell smsEnabled={false} smsFromNumber="+15814360804" />)

    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText('+15814360804')).toBeInTheDocument()
  })
})
