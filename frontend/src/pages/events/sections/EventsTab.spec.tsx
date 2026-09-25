import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsTab from './EventsTab'
import type { EventSettingsValues } from './EventsTab'

const saved: EventSettingsValues = {
  name: 'Permit renewal',
  description: 'Sent when a permit is about to expire',
}

const empty: EventSettingsValues = { name: '', description: '' }

function renderTab(
  values: EventSettingsValues = saved,
  { onSave = vi.fn().mockResolvedValue(undefined), isDisabled = false } = {},
) {
  render(<EventsTab values={values} onSave={onSave} isDisabled={isDisabled} />)
  return { onSave }
}

const nameField = () => screen.getByRole('textbox', { name: /Event name/ })
const descriptionField = () => screen.getByRole('textbox', { name: /Event description/ })
const saveButton = () => screen.getByRole('button', { name: 'Save Event Settings' })

describe('EventsTab', () => {
  it('shows the saved name and description under the section heading', () => {
    renderTab()

    expect(screen.getByRole('heading', { name: 'Event Settings' })).toBeInTheDocument()
    expect(nameField()).toHaveValue('Permit renewal')
    expect(descriptionField()).toHaveValue('Sent when a permit is about to expire')
  })

  it('cannot be saved until something changes', () => {
    renderTab()

    expect(saveButton()).toBeDisabled()
  })

  it('cannot be saved while either field is empty', async () => {
    renderTab(empty)

    expect(saveButton()).toBeDisabled()

    await userEvent.type(nameField(), 'Permit renewal')
    expect(saveButton()).toBeDisabled()

    await userEvent.type(descriptionField(), 'Sent when a permit is about to expire')
    expect(saveButton()).toBeEnabled()
  })

  it('treats a field of only spaces as empty', async () => {
    renderTab(empty)

    await userEvent.type(nameField(), 'Permit renewal')
    await userEvent.type(descriptionField(), '   ')

    expect(saveButton()).toBeDisabled()
  })

  it('saves the trimmed values', async () => {
    const { onSave } = renderTab(empty)

    await userEvent.type(nameField(), '  Permit renewal  ')
    await userEvent.type(descriptionField(), '  Sent when a permit is about to expire  ')
    await userEvent.click(saveButton())

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Permit renewal',
        description: 'Sent when a permit is about to expire',
      }),
    )
  })

  it('saves a change to the description on its own', async () => {
    const { onSave } = renderTab()

    await userEvent.clear(descriptionField())
    await userEvent.type(descriptionField(), 'Sent 30 days before expiry')

    expect(saveButton()).toBeEnabled()

    await userEvent.click(saveButton())

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Permit renewal',
        description: 'Sent 30 days before expiry',
      }),
    )
  })

  it('goes back to disabled when an edit is undone', async () => {
    renderTab()

    await userEvent.type(nameField(), ' update')
    expect(saveButton()).toBeEnabled()

    await userEvent.clear(nameField())
    await userEvent.type(nameField(), 'Permit renewal')

    expect(saveButton()).toBeDisabled()
  })

  it('reports it is saving and locks the form while the save is in flight', async () => {
    let resolveSave: () => void = () => {}
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        }),
    )
    renderTab(saved, { onSave })

    await userEvent.type(nameField(), ' v2')
    await userEvent.click(saveButton())

    const savingButton = await screen.findByRole('button', { name: 'Saving…' })
    expect(savingButton).toBeDisabled()
    expect(nameField()).toBeDisabled()
    expect(descriptionField()).toBeDisabled()

    resolveSave()

    await waitFor(() => expect(screen.getByRole('button', { name: /Save Event Settings/ })))
  })

  it('does not save twice when the button is used again mid-save', async () => {
    const onSave = vi.fn(() => new Promise<void>(() => {}))
    renderTab(saved, { onSave })

    await userEvent.type(nameField(), ' v2')
    await userEvent.click(saveButton())
    await userEvent.click(await screen.findByRole('button', { name: 'Saving…' }))

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  describe('without the role to edit', () => {
    it('locks the fields and the save button', () => {
      renderTab(saved, { isDisabled: true })

      expect(nameField()).toBeDisabled()
      expect(descriptionField()).toBeDisabled()
      expect(saveButton()).toBeDisabled()
    })
  })

  describe('with the role to edit', () => {
    it('leaves the fields open and enables saving once a change is made', async () => {
      renderTab()

      expect(nameField()).toBeEnabled()
      expect(descriptionField()).toBeEnabled()

      await userEvent.type(nameField(), ' v2')

      expect(saveButton()).toBeEnabled()
    })
  })
})
