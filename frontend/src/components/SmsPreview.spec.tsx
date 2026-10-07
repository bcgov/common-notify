import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SmsPreview from './SmsPreview'

describe('SmsPreview', () => {
  it('counts the raw template without showing message parts', () => {
    render(<SmsPreview body="Hello {{name}}" label="Template Preview" />)
    expect(screen.getByText('14/612 characters maximum')).toBeInTheDocument()
    expect(screen.queryByText(/Estimated parts/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })

  it.each([
    ['a'.repeat(161), 161, 2],
    ['😀'.repeat(36), 36, 2],
    ['^'.repeat(81), 81, 2],
  ])('uses SMS encoding when counting the rendered parts', (body, characters, parts) => {
    render(<SmsPreview body={body} showParts />)
    expect(screen.getByText(`${characters}/612 characters maximum`)).toBeInTheDocument()
    expect(screen.getByText(`Estimated parts: ${parts}`)).toBeInTheDocument()
  })
})
