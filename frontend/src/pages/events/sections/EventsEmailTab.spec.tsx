import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsEmailTab from './EventsEmailTab'
import type { EmailSettingsValues } from './EventsEmailTab'
import { NotificationChannel, TemplateEngine } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import type { ApprovedEmailLogo } from '@/interfaces/tenant-settings.interface'
import type { CstarGroup } from '@/api/cstar.api'

const getTemplatesMock = vi.fn()

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    getTemplates: (...args: unknown[]) => getTemplatesMock(...args),
    previewTemplate: vi.fn(),
  }
})

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

const template = {
  id: 'template-1',
  name: 'Permit renewal',
  channelCode: NotificationChannel.EMAIL,
  subject: 'Your permit expires soon',
  body: 'Hello {{firstName}}',
  engineCode: TemplateEngine.HANDLEBARS,
  version: 1,
  active: true,
  createdBy: 'someone',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'someone',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const logos: ApprovedEmailLogo[] = [
  { id: 'logo-1', name: 'BC Gov', imageUrl: 'https://example.test/bcgov.png' },
  { id: 'logo-2', name: 'Ministry', imageUrl: 'https://example.test/ministry.png' },
]

const groups: CstarGroup[] = [
  { id: 'group-1', name: 'Wildfire Ops', description: '' },
  { id: 'group-2', name: 'Flood Response', description: '' },
]

const unconfigured: EmailSettingsValues = {
  active: false,
  senderEmail: '',
  templateId: null,
  to: [],
  cc: [],
  bcc: [],
  cstarGroupIdsTo: [],
  cstarGroupIdsCc: [],
  cstarGroupIdsBcc: [],
  useCustomHeader: false,
  headerLogoId: null,
  headerTitle: '',
}

const savedAndActive: EmailSettingsValues = {
  ...unconfigured,
  active: true,
  senderEmail: 'permits@gov.bc.ca',
  templateId: 'template-1',
  to: ['alice@gov.bc.ca'],
}

type RenderOptions = {
  values?: EmailSettingsValues
  isConfigured?: boolean
  isDisabled?: boolean
  defaultSenderEmail?: string | null
  approvedLogos?: ApprovedEmailLogo[]
  tenantEmailLogoId?: string | null
  tenantName?: string | null
  cstarGroups?: CstarGroup[]
  onSave?: ReturnType<typeof vi.fn>
  onDeactivate?: ReturnType<typeof vi.fn>
}

function renderTab({
  values = unconfigured,
  isConfigured = false,
  isDisabled = false,
  onSave = vi.fn().mockResolvedValue(undefined),
  onDeactivate = vi.fn().mockResolvedValue(undefined),
  ...rest
}: RenderOptions = {}) {
  const view = render(
    <EventsEmailTab
      values={values}
      onSave={onSave}
      onDeactivate={onDeactivate}
      isConfigured={isConfigured}
      isDisabled={isDisabled}
      {...rest}
    />,
  )
  return { ...view, onSave, onDeactivate }
}

const activateSwitch = () => screen.getByRole('switch', { name: 'Activate channel' })
const senderField = () => screen.getByRole('textbox', { name: /Sender email address/ })
const templateSelect = () => screen.getByRole('button', { name: /Template \(required\)/ })
const saveButton = () => screen.getByRole('button', { name: 'Save' })

async function chooseTemplate(name = 'Permit renewal') {
  await userEvent.click(await screen.findByRole('button', { name: /Template \(required\)/ }))
  await userEvent.click(await screen.findByRole('option', { name }))
}

describe('EventsEmailTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTemplatesMock.mockResolvedValue({
      data: [template],
      count: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    })
  })

  describe('before the channel has ever been saved', () => {
    it('offers nothing but the off switch', () => {
      renderTab()

      expect(activateSwitch()).not.toBeChecked()
      expect(
        screen.queryByRole('textbox', { name: /Sender email address/ }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })

    it('reveals the settings once the channel is switched on', async () => {
      renderTab()

      await userEvent.click(activateSwitch())

      expect(activateSwitch()).toBeChecked()
      expect(senderField()).toBeEnabled()
      // Switching on is itself an unsaved change, so it can be applied straight away.
      expect(saveButton()).toBeEnabled()
    })

    it('only asks for the email templates of the tenant', async () => {
      renderTab()

      await waitFor(() =>
        expect(getTemplatesMock).toHaveBeenCalledWith(1, 100, undefined, 'name', [
          'channelCode:eq:EMAIL',
        ]),
      )
    })
  })

  describe('once the channel has been saved', () => {
    it('shows the saved settings, locked, while the channel is off', () => {
      renderTab({
        values: { ...savedAndActive, active: false },
        isConfigured: true,
      })

      expect(activateSwitch()).not.toBeChecked()
      expect(senderField()).toHaveValue('permits@gov.bc.ca')
      expect(senderField()).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: 'Additional recipient(s)' })).toBeDisabled()
    })

    it('shows the saved recipients and template', async () => {
      renderTab({ values: savedAndActive, isConfigured: true })

      expect(screen.getByRole('checkbox', { name: 'Additional recipient(s)' })).toBeChecked()
      expect(screen.getByRole('row', { name: 'alice@gov.bc.ca' })).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: /Permit renewal Template/ })).toBeVisible()
    })

    it('has nothing to save until something is changed', () => {
      renderTab({ values: savedAndActive, isConfigured: true })

      expect(saveButton()).toBeDisabled()
    })
  })

  describe('the sender email address', () => {
    it("starts on the tenant's default when the event has none", () => {
      renderTab({ defaultSenderEmail: 'notify_noreply' })

      expect(activateSwitch()).not.toBeChecked()
      renderTab({ values: { ...unconfigured, active: true }, defaultSenderEmail: 'notify_noreply' })

      expect(screen.getAllByRole('textbox', { name: /Sender email address/ })[0]).toHaveValue(
        'notify_noreply@gov.bc.ca',
      )
    })

    it('backfills the tenant default when tenant settings arrive after the tab has mounted', async () => {
      const { rerender } = renderTab({ values: { ...unconfigured, active: true } })

      expect(senderField()).toHaveValue('')

      rerender(
        <EventsEmailTab
          values={{ ...unconfigured, active: true }}
          onSave={vi.fn()}
          onDeactivate={vi.fn()}
          isConfigured={false}
          defaultSenderEmail="notify_noreply"
        />,
      )

      await waitFor(() => expect(senderField()).toHaveValue('notify_noreply@gov.bc.ca'))
    })

    it('does not write the tenant default over an address the user cleared', async () => {
      const { rerender } = renderTab({
        values: { ...unconfigured, active: true },
        defaultSenderEmail: 'notify_noreply',
      })

      await userEvent.clear(senderField())

      rerender(
        <EventsEmailTab
          values={{ ...unconfigured, active: true }}
          onSave={vi.fn()}
          onDeactivate={vi.fn()}
          isConfigured={false}
          defaultSenderEmail="notify_noreply"
        />,
      )

      expect(senderField()).toHaveValue('')
    })

    it('rejects an address that is not an email address at all', async () => {
      const { onSave } = renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'not-an-email')
      await userEvent.click(saveButton())

      expect(await screen.findByText('Enter a valid sender email address.')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('rejects a valid address outside @gov.bc.ca', async () => {
      const { onSave } = renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'permits@example.com')
      await userEvent.click(saveButton())

      expect(
        await screen.findByText('The sender email address must be an @gov.bc.ca address.'),
      ).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('rejects an empty address on an active channel', async () => {
      const { onSave } = renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.clear(senderField())
      await userEvent.click(saveButton())

      expect(await screen.findByText('Sender email address cannot be empty.')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('says nothing about the address until a save has been attempted', async () => {
      renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'permits@example.com')

      expect(
        screen.queryByText('The sender email address must be an @gov.bc.ca address.'),
      ).not.toBeInTheDocument()
    })

    it('accepts a @gov.bc.ca address', async () => {
      const { onSave } = renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ senderEmail: 'renewals@gov.bc.ca' }),
        ),
      )
    })
  })

  describe('recipients', () => {
    it('offers CSTAR groups and additional recipients; the subscription service is not available yet', () => {
      renderTab({ values: { ...unconfigured, active: true } })

      expect(screen.getByRole('checkbox', { name: 'Subscription Service' })).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: 'CSTAR Group(s)' })).toBeEnabled()
      expect(screen.getByRole('checkbox', { name: 'Additional recipient(s)' })).toBeEnabled()
    })

    it('opens the address fields when additional recipients are chosen', async () => {
      renderTab({ values: { ...unconfigured, active: true } })

      expect(screen.queryByRole('group', { name: 'Additional recipients' })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Additional recipient(s)' }))

      expect(screen.getByRole('group', { name: 'Additional recipients' })).toBeInTheDocument()
    })

    it('requires a recipient when the channel is active', async () => {
      const { onSave } = renderTab({
        values: { ...savedAndActive, to: [] },
        isConfigured: true,
      })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      expect(await screen.findByText('Please select at least one recipient.')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('treats additional recipients with no To address as no recipient at all', async () => {
      const { onSave } = renderTab({ values: { ...savedAndActive, to: [] }, isConfigured: true })

      await userEvent.click(screen.getByRole('checkbox', { name: 'Additional recipient(s)' }))
      await userEvent.click(saveButton())

      expect(await screen.findByText('Please select at least one recipient.')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('blocks saving while a recipient address is malformed', async () => {
      const { onSave } = renderTab({ values: savedAndActive, isConfigured: true })

      const toField = screen.getByRole('textbox', { name: 'To email addresses' })
      await userEvent.type(toField, 'not-an-email ')

      await waitFor(() =>
        expect(toField).toHaveAccessibleDescription(
          'Enter valid email addresses. Invalid: not-an-email',
        ),
      )
      expect(saveButton()).toBeDisabled()
      expect(onSave).not.toHaveBeenCalled()
    })
  })

  describe('CSTAR groups', () => {
    it('opens the group fields when CSTAR groups are chosen', async () => {
      renderTab({ values: { ...unconfigured, active: true }, cstarGroups: groups })

      expect(screen.queryByRole('group', { name: 'CSTAR groups' })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: 'CSTAR Group(s)' }))

      expect(screen.getByRole('group', { name: 'CSTAR groups' })).toBeInTheDocument()
    })

    it('shows the saved groups as chosen', () => {
      renderTab({
        values: { ...savedAndActive, cstarGroupIdsTo: ['group-1'] },
        isConfigured: true,
        cstarGroups: groups,
      })

      expect(screen.getByRole('checkbox', { name: 'CSTAR Group(s)' })).toBeChecked()
      expect(screen.getByRole('group', { name: 'CSTAR groups' })).toBeInTheDocument()
      // Shown as one removable tag per group, in the blue the design calls for.
      expect(screen.getByRole('row', { name: 'Wildfire Ops' })).toHaveClass('blue')
    })

    it('saves the groups picked in each field', async () => {
      const { onSave } = renderTab({
        values: { ...savedAndActive, cstarGroupIdsTo: ['group-1'] },
        isConfigured: true,
        cstarGroups: groups,
      })

      await userEvent.click(await screen.findByRole('button', { name: /To CSTAR groups/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'Flood Response' }))
      await userEvent.keyboard('{Escape}')
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            cstarGroupIdsTo: ['group-1', 'group-2'],
            cstarGroupIdsCc: [],
            cstarGroupIdsBcc: [],
          }),
        ),
      )
    })

    it('counts a To group as a recipient, with no address needed', async () => {
      const { onSave } = renderTab({
        values: { ...savedAndActive, to: [], cstarGroupIdsTo: ['group-1'] },
        isConfigured: true,
        cstarGroups: groups,
      })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ to: [], cstarGroupIdsTo: ['group-1'] }),
        ),
      )
      expect(screen.queryByText('Please select at least one recipient.')).not.toBeInTheDocument()
    })

    it('treats CSTAR groups with no To group as no recipient at all', async () => {
      const { onSave } = renderTab({
        values: { ...savedAndActive, to: [], cstarGroupIdsCc: ['group-1'] },
        isConfigured: true,
        cstarGroups: groups,
      })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      expect(await screen.findByText('Please select at least one recipient.')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('does not save the groups of a source that has been unchosen', async () => {
      const { onSave } = renderTab({
        values: { ...savedAndActive, cstarGroupIdsTo: ['group-1'] },
        isConfigured: true,
        cstarGroups: groups,
      })

      await userEvent.click(screen.getByRole('checkbox', { name: 'CSTAR Group(s)' }))
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ to: ['alice@gov.bc.ca'], cstarGroupIdsTo: [] }),
        ),
      )
    })
  })

  describe('the template', () => {
    it('requires one when the channel is active', async () => {
      const { onSave } = renderTab({
        values: { ...savedAndActive, templateId: null },
        isConfigured: true,
      })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      expect(await screen.findByText('Please select a template.')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('previews the subject and body of the chosen template', async () => {
      renderTab({ values: { ...savedAndActive, templateId: null }, isConfigured: true })

      await chooseTemplate()

      expect(await screen.findByText(/Your permit expires soon/)).toBeInTheDocument()
      expect(screen.getByText('Hello {{firstName}}')).toBeInTheDocument()
    })

    it('cannot be previewed as an email until a template is chosen', async () => {
      renderTab({ values: { ...savedAndActive, templateId: null }, isConfigured: true })

      expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()

      await chooseTemplate()

      expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled()
    })
  })

  describe('the email header', () => {
    it('starts on the tenant default, with no custom fields shown', () => {
      renderTab({
        values: savedAndActive,
        isConfigured: true,
        approvedLogos: logos,
        tenantEmailLogoId: 'logo-1',
        tenantName: 'Ministry of Testing',
      })

      expect(screen.getByRole('radio', { name: 'Use tenant default' })).toBeChecked()
      expect(screen.queryByRole('button', { name: /Email logo\/brand/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: /Header title/ })).not.toBeInTheDocument()
    })

    it('previews the tenant logo while the tenant default is used', () => {
      renderTab({
        values: savedAndActive,
        isConfigured: true,
        approvedLogos: logos,
        tenantEmailLogoId: 'logo-1',
        tenantName: 'Ministry of Testing',
      })

      const preview = screen.getByText('Header Preview').parentElement as HTMLElement
      expect(within(preview).getByRole('presentation')).toHaveAttribute(
        'src',
        'https://example.test/bcgov.png',
      )
      expect(within(preview).queryByText('Ministry of Testing')).not.toBeInTheDocument()
    })

    it('opens the logo and title fields on the tenant defaults when Custom is chosen', async () => {
      renderTab({
        values: savedAndActive,
        isConfigured: true,
        approvedLogos: logos,
        tenantEmailLogoId: 'logo-1',
        tenantName: 'Ministry of Testing',
      })

      await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))

      expect(screen.getByRole('button', { name: /BC Gov Email logo\/brand/ })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /Header title/ })).toHaveValue(
        'Ministry of Testing',
      )
      expect(screen.getByText('Ministry of Testing', { selector: 'span' })).toBeInTheDocument()
    })

    it('saves the chosen logo and title', async () => {
      const { onSave } = renderTab({
        values: savedAndActive,
        isConfigured: true,
        approvedLogos: logos,
        tenantEmailLogoId: 'logo-1',
        tenantName: 'Ministry of Testing',
      })

      await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
      await userEvent.click(screen.getByRole('button', { name: /BC Gov Email logo\/brand/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'Ministry' }))
      await userEvent.clear(screen.getByRole('textbox', { name: /Header title/ }))
      await userEvent.type(screen.getByRole('textbox', { name: /Header title/ }), '  Permits  ')
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            useCustomHeader: true,
            headerLogoId: 'logo-2',
            headerTitle: 'Permits',
          }),
        ),
      )
    })

    it('saves "No logo" as no logo rather than falling back to the tenant one', async () => {
      const { onSave } = renderTab({
        values: savedAndActive,
        isConfigured: true,
        approvedLogos: logos,
        tenantEmailLogoId: 'logo-1',
        tenantName: 'Ministry of Testing',
      })

      await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
      await userEvent.click(screen.getByRole('button', { name: /BC Gov Email logo\/brand/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'No logo' }))
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ useCustomHeader: true, headerLogoId: null }),
        ),
      )
    })

    it('shows a saved custom header as saved', () => {
      renderTab({
        values: {
          ...savedAndActive,
          useCustomHeader: true,
          headerLogoId: 'logo-2',
          headerTitle: 'Permits',
        },
        isConfigured: true,
        approvedLogos: logos,
        tenantEmailLogoId: 'logo-1',
        tenantName: 'Ministry of Testing',
      })

      expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked()
      expect(screen.getByRole('button', { name: /Ministry Email logo\/brand/ })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /Header title/ })).toHaveValue('Permits')
    })

    it('sends no header details when the tenant default is kept', async () => {
      const { onSave } = renderTab({
        values: savedAndActive,
        isConfigured: true,
        approvedLogos: logos,
        tenantEmailLogoId: 'logo-1',
        tenantName: 'Ministry of Testing',
      })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ useCustomHeader: false, headerLogoId: null, headerTitle: '' }),
        ),
      )
    })
  })

  describe('saving', () => {
    it('sends every setting the tab owns, and confirms the save', async () => {
      const { onSave } = renderTab({ values: { ...unconfigured, active: false } })

      await userEvent.click(activateSwitch())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(screen.getByRole('checkbox', { name: 'Additional recipient(s)' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'To' }))
      await userEvent.type(
        screen.getByRole('textbox', { name: 'To email addresses' }),
        'alice@gov.bc.ca ',
      )
      await chooseTemplate()
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith({
          active: true,
          senderEmail: 'renewals@gov.bc.ca',
          templateId: 'template-1',
          to: ['alice@gov.bc.ca'],
          cc: [],
          bcc: [],
          cstarGroupIdsTo: [],
          cstarGroupIdsCc: [],
          cstarGroupIdsBcc: [],
          useCustomHeader: false,
          headerLogoId: null,
          headerTitle: '',
        }),
      )
      expect(showSuccessToast).toHaveBeenCalledWith(
        'Settings saved: Your email notification settings have been saved.',
      )
    })

    it('re-activates a channel on the settings it already has', async () => {
      const { onSave } = renderTab({
        values: { ...savedAndActive, active: false },
        isConfigured: true,
      })

      await userEvent.click(activateSwitch())

      expect(saveButton()).toBeEnabled()

      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            active: true,
            senderEmail: 'permits@gov.bc.ca',
            templateId: 'template-1',
            to: ['alice@gov.bc.ca'],
          }),
        ),
      )
    })

    it('reports a failed save without clearing the form', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Template belongs to another tenant'))
      renderTab({ values: savedAndActive, isConfigured: true, onSave })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith(
          'Unable to save settings: Template belongs to another tenant',
        ),
      )
      expect(senderField()).toHaveValue('renewals@gov.bc.ca')
    })

    it('reports it is saving while the save is in flight', async () => {
      let resolveSave: () => void = () => {}
      const onSave = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve
          }),
      )
      renderTab({ values: savedAndActive, isConfigured: true, onSave })

      await userEvent.clear(senderField())
      await userEvent.type(senderField(), 'renewals@gov.bc.ca')
      await userEvent.click(saveButton())

      const savingButton = await screen.findByRole('button', { name: 'Saving…' })
      expect(savingButton).toBeDisabled()
      expect(activateSwitch()).toBeDisabled()

      resolveSave()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument())
    })
  })

  describe('switching the channel off', () => {
    it('asks before it takes effect', async () => {
      const { onDeactivate } = renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.click(activateSwitch())

      expect(await screen.findByText('Deactivate this channel?')).toBeInTheDocument()
      expect(onDeactivate).not.toHaveBeenCalled()
      // The dialog hides the rest of the page from assistive technology while it is open.
      expect(screen.getByRole('switch', { name: 'Activate channel', hidden: true })).toBeChecked()
    })

    it('leaves the channel on when the confirmation is cancelled', async () => {
      const { onDeactivate } = renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.click(activateSwitch())
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

      await waitFor(() =>
        expect(screen.queryByText('Deactivate this channel?')).not.toBeInTheDocument(),
      )
      expect(onDeactivate).not.toHaveBeenCalled()
      expect(activateSwitch()).toBeChecked()
    })

    it('persists the deactivation immediately once confirmed', async () => {
      const { onDeactivate } = renderTab({ values: savedAndActive, isConfigured: true })

      await userEvent.click(activateSwitch())
      await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))

      await waitFor(() => expect(onDeactivate).toHaveBeenCalledTimes(1))
      expect(activateSwitch()).not.toBeChecked()
      expect(showSuccessToast).toHaveBeenCalledWith(expect.stringContaining('Email channel'))
      // The settings stay on screen, disabled, rather than disappearing.
      expect(senderField()).toBeDisabled()
    })

    it('puts the switch back when the deactivation cannot be saved', async () => {
      const onDeactivate = vi.fn().mockRejectedValue(new Error('Event not found'))
      renderTab({ values: savedAndActive, isConfigured: true, onDeactivate })

      await userEvent.click(activateSwitch())
      await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith('Unable to update channel: Event not found'),
      )
      expect(activateSwitch()).toBeChecked()
    })
  })

  describe('without the role to edit', () => {
    it('locks the switch and every setting', () => {
      renderTab({ values: savedAndActive, isConfigured: true, isDisabled: true })

      expect(activateSwitch()).toBeDisabled()
      expect(senderField()).toBeDisabled()
      expect(templateSelect()).toBeDisabled()
      expect(saveButton()).toBeDisabled()
    })

    it('cannot be saved even after a change would otherwise enable it', async () => {
      const { onSave } = renderTab({
        values: savedAndActive,
        isConfigured: true,
        isDisabled: true,
      })

      await userEvent.click(saveButton())

      expect(onSave).not.toHaveBeenCalled()
    })
  })

  describe('with the role to edit', () => {
    it('leaves the switch and the settings open', () => {
      renderTab({ values: savedAndActive, isConfigured: true })

      expect(activateSwitch()).toBeEnabled()
      expect(senderField()).toBeEnabled()
      expect(templateSelect()).toBeEnabled()
    })
  })
})
