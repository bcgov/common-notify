import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventEmailPreviewModal from './EventEmailPreviewModal'
import { NotificationChannel, TemplateEngine } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import type { EventEmailSettings } from '@/api/events.api'

const previewTemplateMock = vi.fn()
vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    previewTemplate: (...args: unknown[]) => previewTemplateMock(...args),
  }
})

// The header looks its logo up in the store; here it only needs to show it was placed.
vi.mock('./EventEmailHeader', () => ({
  default: () => <div>Email header</div>,
}))

const template = {
  id: 'template-1',
  name: 'Permit Renewal',
  channelCode: NotificationChannel.EMAIL,
  subject: 'Your permit',
  body: 'Hello {{firstName}}{{#if isUrgent}}, act now{{/if}}',
  engineCode: TemplateEngine.HANDLEBARS,
  version: 1,
  active: true,
  createdBy: 'someone',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'someone',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const emailSettings: EventEmailSettings = {
  active: true,
  senderEmail: 'permits@gov.bc.ca',
  templateId: 'template-1',
  to: [],
  cc: [],
  bcc: [],
  cstarGroupIdsTo: [],
  cstarGroupIdsCc: [],
  cstarGroupIdsBcc: [],
  useCustomHeader: false,
  headerLogoId: null,
  headerTitle: null,
}

type Props = Parameters<typeof EventEmailPreviewModal>[0]

function renderModal(overrides: Partial<Props> = {}) {
  const props: Props = {
    isOpen: true,
    onClose: vi.fn(),
    template,
    emailSettings,
    from: 'permits@gov.bc.ca',
    to: 'me@gov.bc.ca',
    values: {},
    onApply: vi.fn(),
    ...overrides,
  }
  const view = render(<EventEmailPreviewModal {...props} />)
  return { ...view, props }
}

// Editable fields are required, and the design system folds "(required)" into the label.
const firstNameField = () => screen.getByLabelText(/^firstName/)
const applyButton = () => screen.getByRole('button', { name: 'Apply to test notification' })

describe('EventEmailPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    previewTemplateMock.mockImplementation(
      (_id: string, params: { firstName: string; isUrgent: string }) =>
        Promise.resolve({
          subject: `Permit for ${params.firstName}`,
          body: `Hello ${params.firstName}`,
          html: `<p>Hello ${params.firstName}</p>`,
        }),
    )
  })

  it('renders nothing, and asks for no render, while closed', () => {
    renderModal({ isOpen: false })

    expect(screen.queryByText('Edit Notification Values')).not.toBeInTheDocument()
    expect(previewTemplateMock).not.toHaveBeenCalled()
  })

  describe('on opening', () => {
    it('offers a field for each template variable, filled from the values already applied', async () => {
      renderModal({ values: { firstName: 'Molly' } })

      expect(firstNameField()).toHaveValue('Molly')
      // A condition starts out true, so the branch it guards is part of the first render.
      expect(screen.getByRole('radio', { name: 'True' })).toBeChecked()
      await screen.findByText('Permit for Molly')
    })

    it('renders the template with those values', async () => {
      renderModal({ values: { firstName: 'Molly', isUrgent: 'false' } })

      await waitFor(() =>
        expect(previewTemplateMock).toHaveBeenCalledWith('template-1', {
          firstName: 'Molly',
          // A false condition is sent empty, so the template treats it as falsy.
          isUrgent: '',
        }),
      )
    })

    it('shows the envelope, subject, header and body as the email will carry them', async () => {
      renderModal({ values: { firstName: 'Molly' } })

      expect(await screen.findByText('Permit for Molly')).toBeInTheDocument()
      expect(screen.getByText('permits@gov.bc.ca')).toBeInTheDocument()
      expect(screen.getByText('me@gov.bc.ca')).toBeInTheDocument()
      expect(screen.getByText('Email header')).toBeInTheDocument()
      // Framed, as on the page: the template is tenant-authored.
      expect(screen.getByTitle('Rendered email').getAttribute('srcdoc')).toContain('Hello Molly')
    })

    it('leaves out an envelope line that has no address', async () => {
      renderModal({ to: '', values: { firstName: 'Molly' } })

      await screen.findByText('Permit for Molly')
      expect(screen.queryByText('To:')).not.toBeInTheDocument()
      expect(screen.getByText('From:')).toBeInTheDocument()
    })

    it('starts again from the applied values each time it opens', async () => {
      const { rerender, props } = renderModal({ values: { firstName: 'Molly' } })

      await userEvent.type(firstNameField(), '!')
      expect(firstNameField()).toHaveValue('Molly!')

      rerender(<EventEmailPreviewModal {...props} isOpen={false} />)
      rerender(<EventEmailPreviewModal {...props} isOpen />)

      await waitFor(() => expect(firstNameField()).toHaveValue('Molly'))
    })
  })

  describe('editing values', () => {
    it('has nothing to apply until a value is changed', async () => {
      renderModal({ values: { firstName: 'Molly' } })

      await screen.findByText('Permit for Molly')
      expect(applyButton()).toBeDisabled()

      await userEvent.type(firstNameField(), '!')

      expect(applyButton()).toBeEnabled()
    })

    it('re-renders the preview once typing stops', async () => {
      renderModal({ values: { firstName: 'Molly' } })
      await screen.findByText('Permit for Molly')

      await userEvent.clear(firstNameField())
      await userEvent.type(firstNameField(), 'Ann')

      expect(await screen.findByText('Permit for Ann', {}, { timeout: 2000 })).toBeInTheDocument()
      expect(previewTemplateMock).toHaveBeenLastCalledWith('template-1', {
        firstName: 'Ann',
        isUrgent: 'true',
      })
    })

    it('sends a condition switched off as empty', async () => {
      renderModal({ values: { firstName: 'Molly' } })
      await screen.findByText('Permit for Molly')

      await userEvent.click(screen.getByRole('radio', { name: 'False' }))

      await waitFor(
        () =>
          expect(previewTemplateMock).toHaveBeenLastCalledWith('template-1', {
            firstName: 'Molly',
            isUrgent: '',
          }),
        { timeout: 2000 },
      )
    })
  })

  describe('applying', () => {
    it('renders the values as they stand and hands them back with the render', async () => {
      const { props } = renderModal({ values: { firstName: 'Molly' } })
      await screen.findByText('Permit for Molly')

      await userEvent.type(firstNameField(), '!')
      await userEvent.click(applyButton())

      await waitFor(() =>
        expect(props.onApply).toHaveBeenCalledWith({
          values: { firstName: 'Molly!', isUrgent: 'true' },
          params: { firstName: 'Molly!', isUrgent: 'true' },
          rendered: {
            subject: 'Permit for Molly!',
            bodyHtml: '<p>Hello Molly!</p>',
            bodyText: 'Hello Molly!',
          },
        }),
      )
    })

    it('hands back a condition switched off as empty, the way the preview rendered it', async () => {
      const { props } = renderModal({ values: { firstName: 'Molly' } })
      await screen.findByText('Permit for Molly')

      await userEvent.click(screen.getByRole('radio', { name: 'False' }))
      await userEvent.click(applyButton())

      await waitFor(() =>
        expect(props.onApply).toHaveBeenCalledWith(
          expect.objectContaining({
            values: { firstName: 'Molly', isUrgent: 'false' },
            params: { firstName: 'Molly', isUrgent: '' },
          }),
        ),
      )
    })

    it('shows it is applying while the render is in flight', async () => {
      renderModal({ values: { firstName: 'Molly' } })
      await screen.findByText('Permit for Molly')
      await userEvent.type(firstNameField(), '!')

      let resolveRender: (value: unknown) => void = () => {}
      previewTemplateMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRender = resolve
          }),
      )
      await userEvent.click(applyButton())

      expect(screen.getByRole('button', { name: 'Applying...' })).toBeDisabled()

      resolveRender({ subject: 'Done', body: 'Done', html: '<p>Done</p>' })
      await waitFor(() => expect(applyButton()).toBeEnabled())
    })

    it('applies nothing when the values cannot be rendered, and says why', async () => {
      const { props } = renderModal({ values: { firstName: 'Molly' } })
      await screen.findByText('Permit for Molly')
      await userEvent.type(firstNameField(), '!')

      previewTemplateMock.mockRejectedValue(new Error('Missing value: isUrgent'))
      await userEvent.click(applyButton())

      expect(await screen.findByText('Missing value: isUrgent')).toBeInTheDocument()
      expect(props.onApply).not.toHaveBeenCalled()
    })
  })

  it('reports a failed render that gives no reason', async () => {
    previewTemplateMock.mockRejectedValue('boom')
    renderModal()

    expect(await screen.findByText('Failed to render preview')).toBeInTheDocument()
  })

  it('lets the note about where values come from be dismissed', async () => {
    renderModal()
    const notice =
      'Notification values are generated from your API payload and notification event settings.'

    expect(screen.getByText(notice)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close this alert' }))

    expect(screen.queryByText(notice)).not.toBeInTheDocument()
  })
})
