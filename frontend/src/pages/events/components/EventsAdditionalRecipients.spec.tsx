import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsAdditionalRecipients from './EventsAdditionalRecipients'
import type { RecipientAddresses, RecipientVariant } from './EventsAdditionalRecipients'

const noAddresses: RecipientAddresses = { to: [], cc: [], bcc: [] }

type HarnessProps = {
  initial?: RecipientAddresses
  onChange?: (values: RecipientAddresses) => void
  invalidAddresses?: RecipientAddresses
  isDisabled?: boolean
  variant?: RecipientVariant
}

/** The parent owns the addresses, the same way EventsEmailTab does. */
function Harness({ initial = noAddresses, onChange, ...rest }: HarnessProps) {
  const [values, setValues] = useState(initial)

  return (
    <EventsAdditionalRecipients
      values={values}
      onChange={(next) => {
        setValues(next)
        onChange?.(next)
      }}
      {...rest}
    />
  )
}

const field = (label: string) => screen.getByRole('textbox', { name: `${label} email addresses` })

describe('EventsAdditionalRecipients', () => {
  describe('email variant', () => {
    it('offers To, CC and BCC, all unchecked and without inputs, when there is nothing saved', () => {
      render(<Harness />)

      for (const label of ['To', 'CC', 'BCC']) {
        expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked()
      }
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('opens a field only for the recipient type that is checked on', async () => {
      render(<Harness />)

      await userEvent.click(screen.getByRole('checkbox', { name: 'CC' }))

      expect(field('CC')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'To email addresses' })).not.toBeInTheDocument()
    })

    it('starts with the saved addresses shown under their checked fields', () => {
      render(<Harness initial={{ to: ['alice@gov.bc.ca'], cc: [], bcc: ['audit@gov.bc.ca'] }} />)

      expect(screen.getByRole('checkbox', { name: 'To' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'CC' })).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'BCC' })).toBeChecked()
      expect(screen.getByRole('row', { name: 'alice@gov.bc.ca' })).toBeInTheDocument()
      expect(screen.getByRole('row', { name: 'audit@gov.bc.ca' })).toBeInTheDocument()
    })

    it('reports an address entered in a field', async () => {
      const onChange = vi.fn()
      render(<Harness onChange={onChange} />)

      await userEvent.click(screen.getByRole('checkbox', { name: 'To' }))
      await userEvent.type(field('To'), 'alice@gov.bc.ca ')

      expect(onChange).toHaveBeenLastCalledWith({ to: ['alice@gov.bc.ca'], cc: [], bcc: [] })
    })

    it('keeps each recipient type separate', async () => {
      const onChange = vi.fn()
      render(<Harness onChange={onChange} />)

      await userEvent.click(screen.getByRole('checkbox', { name: 'To' }))
      await userEvent.type(field('To'), 'alice@gov.bc.ca ')
      await userEvent.click(screen.getByRole('checkbox', { name: 'BCC' }))
      await userEvent.type(field('BCC'), 'audit@gov.bc.ca ')

      expect(onChange).toHaveBeenLastCalledWith({
        to: ['alice@gov.bc.ca'],
        cc: [],
        bcc: ['audit@gov.bc.ca'],
      })
    })

    it('stops reporting a recipient type that is unchecked, and hides its field', async () => {
      const onChange = vi.fn()
      render(<Harness initial={{ to: ['alice@gov.bc.ca'], cc: [], bcc: [] }} onChange={onChange} />)

      await userEvent.click(screen.getByRole('checkbox', { name: 'To' }))

      expect(onChange).toHaveBeenLastCalledWith({ to: [], cc: [], bcc: [] })
      expect(screen.queryByRole('textbox', { name: 'To email addresses' })).not.toBeInTheDocument()
      expect(screen.queryByRole('row', { name: 'alice@gov.bc.ca' })).not.toBeInTheDocument()
    })

    it('restores what was typed when an unchecked field is checked back on', async () => {
      const onChange = vi.fn()
      render(<Harness initial={{ to: ['alice@gov.bc.ca'], cc: [], bcc: [] }} onChange={onChange} />)

      await userEvent.click(screen.getByRole('checkbox', { name: 'To' }))
      // Unchecking reports an empty list, so nothing is saved for the field...
      expect(onChange).toHaveBeenLastCalledWith({ to: [], cc: [], bcc: [] })

      await userEvent.click(screen.getByRole('checkbox', { name: 'To' }))

      // ...but the addresses are still there to be sent again once it is checked back on.
      expect(field('To')).toBeInTheDocument()
      expect(screen.getByRole('row', { name: 'alice@gov.bc.ca' })).toBeInTheDocument()
      expect(onChange).toHaveBeenLastCalledWith({ to: ['alice@gov.bc.ca'], cc: [], bcc: [] })
    })

    it('names the malformed addresses the parent rejected, per field', () => {
      render(
        <Harness
          initial={{ to: ['nope'], cc: [], bcc: [] }}
          invalidAddresses={{ to: ['nope'], cc: [], bcc: [] }}
        />,
      )

      expect(field('To')).toHaveAccessibleDescription('Enter valid email addresses. Invalid: nope')
    })

    it('leaves a field with no rejected addresses undescribed', () => {
      render(
        <Harness
          initial={{ to: ['alice@gov.bc.ca'], cc: ['nope'], bcc: [] }}
          invalidAddresses={{ to: [], cc: ['nope'], bcc: [] }}
        />,
      )

      expect(field('To')).not.toHaveAccessibleDescription(/Enter valid email addresses/)
      expect(field('CC')).toHaveAccessibleDescription('Enter valid email addresses. Invalid: nope')
    })

    it('locks the checkboxes and the fields when disabled', () => {
      render(<Harness initial={{ to: ['alice@gov.bc.ca'], cc: [], bcc: [] }} isDisabled />)

      expect(screen.getByRole('checkbox', { name: 'To' })).toBeDisabled()
      expect(field('To')).toBeDisabled()
    })

    it('picks up addresses the parent re-seeds after a save', () => {
      const { rerender } = render(
        <EventsAdditionalRecipients
          values={{ to: ['alice@gov.bc.ca'], cc: [], bcc: [] }}
          onChange={vi.fn()}
        />,
      )

      rerender(
        <EventsAdditionalRecipients
          values={{ to: ['normalized@gov.bc.ca'], cc: [], bcc: [] }}
          onChange={vi.fn()}
        />,
      )

      expect(screen.getByRole('row', { name: 'normalized@gov.bc.ca' })).toBeInTheDocument()
      expect(screen.queryByRole('row', { name: 'alice@gov.bc.ca' })).not.toBeInTheDocument()
    })
  })

  describe('sms variant', () => {
    it('shows a single always-visible phone number field, with no checkboxes', () => {
      render(<Harness variant="sms" />)

      expect(screen.getByRole('textbox', { name: 'Phone numbers' })).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('reports a typed number as a To recipient without anything being checked on', async () => {
      const onChange = vi.fn()
      render(<Harness variant="sms" onChange={onChange} />)

      await userEvent.type(screen.getByRole('textbox', { name: 'Phone numbers' }), '2505550100 ')

      expect(onChange).toHaveBeenLastCalledWith({ to: ['2505550100'], cc: [], bcc: [] })
    })

    it('names the rejected numbers', () => {
      render(
        <Harness
          variant="sms"
          initial={{ to: ['nope'], cc: [], bcc: [] }}
          invalidAddresses={{ to: ['nope'], cc: [], bcc: [] }}
        />,
      )

      expect(screen.getByRole('textbox', { name: 'Phone numbers' })).toHaveAccessibleDescription(
        'Enter valid, unique phone numbers. Invalid or duplicate: nope',
      )
    })

    it('locks the field when disabled', () => {
      render(<Harness variant="sms" isDisabled />)

      expect(screen.getByRole('textbox', { name: 'Phone numbers' })).toBeDisabled()
    })
  })
})
