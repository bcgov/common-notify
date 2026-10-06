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
const configured = { active: false, templateId: 'sms-template', to: ['+12505551234'] }

function setup(
  options: { empty?: boolean; disabled?: boolean; onDirty?: (value: boolean) => void } = {},
) {
  return render(
    <EventsSmsTab
      values={options.empty ? { active: false, templateId: null, to: [] } : configured}
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
})

describe('SMS event MVP', () => {
  it('keeps empty Save and Preview enabled and validates on click without saving', async () => {
    setup({ empty: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Activate channel' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Please select at least one recipient.')).toBeVisible()
    expect(screen.getByText('Please select a template.')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(showErrorToast).toHaveBeenLastCalledWith(
      'Required fields missing or invalid',
      expect.stringContaining('Preview not available'),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('saves an unchanged complete configuration inactive and displays the saved summary', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(configured))
    expect(await screen.findByText('SMS settings saved')).toBeVisible()
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
    expect(screen.getByText('Please select at least one recipient.')).toBeVisible()
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
    expect(screen.queryByText('SMS settings saved')).not.toBeInTheDocument()
  })

  it('prevents read-only users from saving or previewing', () => {
    setup({ disabled: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()
  })
})
