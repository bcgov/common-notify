import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationPreviewModal from './NotificationPreviewModal'
import type { PreviewVariable } from './NotificationPreviewModal'

const variables: PreviewVariable[] = [
  { name: 'firstName', value: 'Molly', type: 'text' },
  { name: 'isApproved', value: 'true', type: 'boolean' },
]

function renderModal(overrides: Partial<Parameters<typeof NotificationPreviewModal>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <NotificationPreviewModal
      isOpen
      onClose={onClose}
      title="Bulk Notifications Preview"
      variables={variables}
      variablesIntro="These values come from your CSV file."
      bodyText="Hello Molly"
      {...overrides}
    />,
  )
  return { onClose }
}

describe('NotificationPreviewModal', () => {
  it('renders nothing while closed', () => {
    renderModal({ isOpen: false })

    expect(screen.queryByText('Bulk Notifications Preview')).not.toBeInTheDocument()
  })

  it('shows the values the body was rendered from', () => {
    renderModal()

    expect(screen.getByLabelText('firstName')).toHaveValue('Molly')
  })

  it('locks the values when they came from somewhere else', () => {
    renderModal()

    // Read-only rather than disabled: the value still needs to be readable and selectable.
    expect(screen.getByLabelText('firstName')).toHaveAttribute('readonly')
  })

  // A single-choice toggle group announces as a radio group, which is what it is.
  it('shows a boolean as a True/False pair rather than a text value', () => {
    renderModal()

    expect(screen.getByRole('radio', { name: 'True' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'False' })).not.toBeChecked()
  })

  it('locks the True/False pair when the values came from somewhere else', () => {
    renderModal()

    expect(screen.getByRole('radio', { name: 'True' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'False' })).toBeDisabled()
  })

  it('reports the new state when a boolean is switched', async () => {
    const onVariableChange = vi.fn()
    renderModal({ isEditable: true, onVariableChange })

    await userEvent.click(screen.getByRole('radio', { name: 'False' }))

    expect(onVariableChange).toHaveBeenCalledWith('isApproved', 'false')
  })

  it('lets values be edited when the caller owns them', async () => {
    const onVariableChange = vi.fn()
    renderModal({ isEditable: true, onVariableChange })

    // Editable fields are required, and the design system folds "(required)" into the label.
    await userEvent.type(screen.getByLabelText(/^firstName/), '!')

    expect(onVariableChange).toHaveBeenCalledWith('firstName', 'Molly!')
  })

  it('shows the envelope when the caller supplies one', () => {
    renderModal({ from: 'noreply@gov.bc.ca', to: 'alee@gov.bc.ca', subject: 'Pizza Pizza' })

    expect(screen.getByText('noreply@gov.bc.ca')).toBeInTheDocument()
    expect(screen.getByText('alee@gov.bc.ca')).toBeInTheDocument()
    expect(screen.getByText('Pizza Pizza')).toBeInTheDocument()
  })

  it('renders an HTML body in a sandboxed frame so template markup cannot reach the app', () => {
    renderModal({ bodyHtml: '<p>Hello <b>Molly</b></p>' })

    const frame = screen.getByTitle('Rendered email')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame).toHaveAttribute('srcdoc', '<p>Hello <b>Molly</b></p>')
  })

  it('falls back to plain text when there is no HTML body', () => {
    renderModal()

    expect(screen.getByText('Hello Molly')).toBeInTheDocument()
    expect(screen.queryByTitle('Rendered email')).not.toBeInTheDocument()
  })

  it('steps between messages', async () => {
    const onNext = vi.fn()
    renderModal({
      stepper: {
        label: 'Email notification 1 of 63',
        onPrevious: vi.fn(),
        onNext,
        hasPrevious: false,
        hasNext: true,
      },
    })

    expect(screen.getByText('Email notification 1 of 63')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onNext).toHaveBeenCalled()
  })

  it('shows a progress indicator while the body is being rendered', () => {
    renderModal({ isLoading: true, bodyHtml: '<p>stale</p>' })

    expect(screen.getByRole('progressbar', { name: 'Rendering preview' })).toBeInTheDocument()
    // The previous render must not sit under the indicator looking current.
    expect(screen.queryByTitle('Rendered email')).not.toBeInTheDocument()
  })

  it('reports a render failure instead of showing a stale body', () => {
    renderModal({ error: 'Failed to render this row', bodyHtml: '<p>stale</p>' })

    expect(screen.getByText('Failed to render this row')).toBeInTheDocument()
    expect(screen.queryByTitle('Rendered email')).not.toBeInTheDocument()
  })

  it('offers exactly one visible close control', () => {
    renderModal()

    // The dismissable Modal already renders one; a second in our header was a duplicate ✕.
    const closeButtons = screen
      .getAllByRole('button')
      .filter((button) => /close/i.test(button.getAttribute('aria-label') ?? ''))

    expect(closeButtons).toHaveLength(1)
  })

  it('steps with buttons rather than links, so they do not read as navigation', () => {
    renderModal({
      stepper: {
        label: 'Email notification 1 of 63',
        onPrevious: vi.fn(),
        onNext: vi.fn(),
        hasPrevious: true,
        hasNext: true,
      },
    })

    expect(screen.getByRole('button', { name: 'Previous' }).tagName).toBe('BUTTON')
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
  })
})
