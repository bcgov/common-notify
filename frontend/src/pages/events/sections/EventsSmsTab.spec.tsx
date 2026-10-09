import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsSmsTab from './EventsSmsTab'
import { NotificationChannel, TemplateEngine } from '@/api/templates.api'
import { showErrorToast } from '@/redux/utils/toastUtils'

vi.mock('@tanstack/react-router', () => ({ useBlocker: () => ({ status: 'idle' }) }))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }))
vi.mock('@/hooks/useChannelTemplates', () => ({
  useChannelTemplates: () => [
    {
      id: 'sms-template',
      name: 'SMS template',
      body: 'Hello',
      engineCode: TemplateEngine.HANDLEBARS,
      channelCode: NotificationChannel.SMS,
    },
  ],
}))
vi.mock('./EventsSmsPreviewModal', () => ({ default: () => <div role="dialog">SMS preview</div> }))
const onSave = vi.fn()
const onDeactivate = vi.fn()
const configured = { active: true, templateId: 'sms-template', to: ['+12505551234'] }

function setup(
  options: {
    sender?: string
    active?: boolean
    unassigned?: boolean
    empty?: boolean
    disabled?: boolean
    onDirty?: (value: boolean) => void
  } = {},
) {
  return render(
    <EventsSmsTab
      values={
        options.empty
          ? { active: options.active ?? true, templateId: null, to: [] }
          : { ...configured, active: options.active ?? true }
      }
      senderPhoneNumber={options.unassigned ? null : (options.sender ?? '+15551234567')}
      onSave={onSave}
      onDeactivate={onDeactivate}
      isConfigured={false}
      isDisabled={options.disabled}
      onUnsavedChangesChange={options.onDirty}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  onSave.mockResolvedValue(undefined)
  onDeactivate.mockResolvedValue(undefined)
})

describe('SMS event MVP', () => {
  it('never allows sender entry and rejects activation without a tenant assignment', async () => {
    setup({ unassigned: true })
    const input = screen.getByRole('textbox', { name: /Sender phone number/ })
    expect(input).toHaveAttribute('readonly')
    expect(input).toHaveValue('Not assigned')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'A sender number must be assigned to your tenant before SMS can be activated.',
      ),
    ).toBeVisible()
  })

  it('uses the assigned sender and saves activation only after Save', async () => {
    setup({ sender: '+15551234567', active: false })
    expect(screen.queryByRole('textbox', { name: /Sender phone number/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Activate channel' }))
    expect(screen.getByRole('textbox', { name: /Sender phone number/ })).toHaveValue('+15551234567')
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...configured, active: true }))
  })

  it('hides actions initially off and validates after switching on', async () => {
    setup({ sender: '+15551234567', empty: true, active: false })
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('switch', { name: 'Activate channel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Select at least one recipient')).toBeVisible()
    expect(screen.getByText('Select a template')).toBeVisible()
  })

  it('returns to the saved summary and confirms deactivation before disabling retained fields', async () => {
    render(
      <EventsSmsTab
        values={{ ...configured, active: true }}
        senderPhoneNumber="+15551234567"
        isConfigured
        onSave={onSave}
        onDeactivate={onDeactivate}
      />,
    )
    expect(screen.getByText('Ready to send?')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Edit settings' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Activate channel' }))
    expect(onDeactivate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('switch', { name: 'Activate channel' })).toBeChecked()
    await userEvent.click(screen.getByRole('switch', { name: 'Activate channel' }))
    await userEvent.click(screen.getByRole('button', { name: /^Deactivate$/ }))
    await waitFor(() => expect(onDeactivate).toHaveBeenCalledOnce())
    expect(screen.getByRole('switch', { name: 'Activate channel' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Additional recipient(s)' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: /Sender phone number/ })).toHaveValue('+15551234567')
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  }, 15000)

  it('keeps empty Save and Preview enabled and validates on click without saving', async () => {
    setup({ empty: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Activate channel' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Select at least one recipient')).toBeVisible()
    expect(screen.getByText('Select a template')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(showErrorToast).toHaveBeenLastCalledWith(
      'Required fields missing',
      expect.stringContaining('Preview not available'),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('saves an unchanged complete configuration and displays the saved summary', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(configured))
    expect(await screen.findByText('Ready to send?')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue to test notification' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Edit settings' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('does not submit hidden phone numbers after deselecting recipients', async () => {
    const onDirty = vi.fn()
    setup({ onDirty })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Additional recipient(s)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onDirty).toHaveBeenLastCalledWith(true)
    expect(screen.getByText('Select at least one recipient')).toBeVisible()
  })

  it('previews valid settings without saving them', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('retains the editable form on save failure', async () => {
    onSave.mockRejectedValue(new Error('Unavailable'))
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith('Unable to save settings', 'Unavailable'),
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.queryByText('Ready to send?')).not.toBeInTheDocument()
  })

  it('prevents read-only users from saving or previewing', () => {
    setup({ disabled: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()
  })
})
