import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsEmailTestSend from './EventsEmailTestSend'
import { NotificationChannel, TemplateEngine } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import type * as EventsApi from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const navigateMock = vi.fn()
let blockerOptions: { shouldBlockFn: () => boolean } | null = null

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => navigateMock,
  useBlocker: (options: { shouldBlockFn: () => boolean }) => {
    blockerOptions = options
    return { status: 'idle', proceed: vi.fn(), reset: vi.fn() }
  },
}))

let state: {
  tenant: { selectedTenant: { id: string } | null }
  auth: { user: { email: string } | null }
}
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

const getEventByIdMock = vi.fn()
const sendEventTestEmailMock = vi.fn()
vi.mock('@/api/events.api', async () => {
  const actual = await vi.importActual<typeof EventsApi>('@/api/events.api')
  return {
    ...actual,
    getEventById: (...args: unknown[]) => getEventByIdMock(...args),
    sendEventTestEmail: (...args: unknown[]) => sendEventTestEmailMock(...args),
  }
})

const getTemplateByIdMock = vi.fn()
const previewTemplateMock = vi.fn()
vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    getTemplateById: (...args: unknown[]) => getTemplateByIdMock(...args),
    previewTemplate: (...args: unknown[]) => previewTemplateMock(...args),
  }
})

// The preview and its modal have specs of their own; here they only need to show what they were
// handed, and the modal to hand back a set of applied values.
vi.mock('../components/EventEmailPreview', () => ({
  default: ({
    envelope,
    rendered,
  }: {
    envelope?: { from: string; to: string }
    rendered?: { subject: string }
  }) => (
    <div data-testid="preview">
      <span>To: {envelope?.to}</span>
      <span>Subject: {rendered?.subject ?? 'raw template'}</span>
    </div>
  ),
}))

vi.mock('../components/EventEmailPreviewModal', () => ({
  default: ({ isOpen, onApply }: { isOpen: boolean; onApply: (applied: unknown) => void }) =>
    isOpen ? (
      <button
        type="button"
        onClick={() =>
          onApply({
            values: { firstName: 'Alice', isUrgent: 'false' },
            params: { firstName: 'Alice', isUrgent: '' },
            rendered: { subject: 'Hello Alice', bodyText: 'Hi Alice' },
          })
        }
      >
        Apply values
      </button>
    ) : null,
}))

// The design system's controls are react-aria components; swapped for plain markup so the test
// drives the page, not the library.
vi.mock('@bcgov/design-system-react-components', () => {
  const Button = ({
    children,
    onPress,
    isDisabled,
    type = 'button',
  }: {
    children: ReactNode
    onPress?: () => void
    isDisabled?: boolean
    type?: 'button' | 'submit'
  }) => (
    <button type={type} onClick={onPress} disabled={isDisabled}>
      {children}
    </button>
  )

  const RadioGroup = ({
    label,
    value,
    onChange,
    errorMessage,
    children,
  }: {
    label: string
    value?: string
    onChange?: (value: string) => void
    errorMessage?: string
    children: ReactNode
  }) => (
    <fieldset>
      <legend>{label}</legend>
      <div
        onChange={(event) => onChange?.((event.target as HTMLInputElement).value)}
        data-value={value}
      >
        {children}
      </div>
      {errorMessage ? <p>{errorMessage}</p> : null}
    </fieldset>
  )

  const Radio = ({ value, children }: { value: string; children: ReactNode }) => (
    <label>
      <input type="radio" name="choice" value={value} />
      {children}
    </label>
  )

  const TextField = ({
    label,
    value,
    onChange,
    errorMessage,
  }: {
    label: string
    value: string
    onChange?: (value: string) => void
    errorMessage?: string
  }) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange?.(event.target.value)} />
      {errorMessage ? <span>{errorMessage}</span> : null}
    </label>
  )

  const Callout = ({ title, description }: { title?: string; description?: string }) => (
    <div>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )

  const InlineAlert = ({ title, description }: { title?: string; description?: string }) => (
    <div role="status">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )

  const Icon = () => <svg aria-hidden="true" />

  return {
    Button,
    Callout,
    InlineAlert,
    Radio,
    RadioGroup,
    TextField,
    SvgCheckCircleIcon: Icon,
    SvgChevronLeftIcon: Icon,
    SvgChevronRightIcon: Icon,
  }
})

const template = {
  id: 'template-1',
  name: 'Permit Renewal',
  channelCode: NotificationChannel.EMAIL,
  subject: 'Your {{permitType}} permit',
  body: 'Hello {{firstName}}',
  engineCode: TemplateEngine.HANDLEBARS,
  version: 1,
  active: true,
  createdBy: 'someone',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'someone',
  updatedAt: '2026-08-01T00:00:00.000Z',
  placeholders: { paths: ['firstName'], unsupported: [] },
}

const event: EventResponse = {
  id: 'event-1',
  name: 'Permit expiry',
  description: '',
  channelCodes: ['EMAIL'],
  status: 'ACTIVE' as EventResponse['status'],
  emailSettings: {
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
  },
  smsSettings: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

function renderPage() {
  return render(<EventsEmailTestSend eventId="event-1" />)
}

function csv(contents: string) {
  return new File([contents], 'recipients.csv', { type: 'text/csv' })
}

const sendButton = (count = 1) => screen.getByRole('button', { name: `Send test email (${count})` })

async function choose(name: string) {
  await userEvent.click(await screen.findByRole('radio', { name }))
}

async function chooseOneRecipient() {
  await choose('Another recipient')
  await choose('One recipient')
}

async function chooseManyRecipients() {
  await choose('Another recipient')
  await choose('Many recipients (upload a spreadsheet/CSV)')
}

describe('EventsEmailTestSend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blockerOptions = null
    state = {
      tenant: { selectedTenant: { id: 'tenant-1' } },
      auth: { user: { email: 'me@gov.bc.ca' } },
    }
    getEventByIdMock.mockResolvedValue(event)
    getTemplateByIdMock.mockResolvedValue(template)
    previewTemplateMock.mockImplementation((_id: string, params: { firstName?: string }) =>
      Promise.resolve({
        subject: `Hello ${params.firstName}`,
        body: `Hi ${params.firstName}`,
        html: `<p>Hi ${params.firstName}</p>`,
      }),
    )
    sendEventTestEmailMock.mockResolvedValue({})
  })

  describe('loading the event', () => {
    it('waits for a tenant before fetching the event', () => {
      state.tenant.selectedTenant = null
      renderPage()

      expect(getEventByIdMock).not.toHaveBeenCalled()
      expect(screen.getByText('Loading event...')).toBeInTheDocument()
    })

    it('fetches the event and its template', async () => {
      renderPage()

      expect(await screen.findByRole('radio', { name: 'Myself' })).toBeInTheDocument()
      expect(getEventByIdMock).toHaveBeenCalledWith('event-1')
      await waitFor(() => expect(getTemplateByIdMock).toHaveBeenCalledWith('template-1'))
    })

    it('reports an event that could not be loaded', async () => {
      getEventByIdMock.mockRejectedValue(new Error('Event not found'))
      renderPage()

      expect(await screen.findByText('Event not found')).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Myself' })).not.toBeInTheDocument()
    })

    it('says when the event has no email settings to test', async () => {
      getEventByIdMock.mockResolvedValue({ ...event, emailSettings: null })
      renderPage()

      expect(
        await screen.findByText('This event has no saved email notification settings yet.'),
      ).toBeInTheDocument()
    })
  })

  describe('before a recipient is chosen', () => {
    it('shows no review', async () => {
      renderPage()

      await screen.findByRole('radio', { name: 'Myself' })
      expect(screen.queryByText('Review Notification')).not.toBeInTheDocument()
    })

    it('flags the missing choice instead of sending', async () => {
      renderPage()

      await screen.findByRole('radio', { name: 'Myself' })
      await userEvent.click(sendButton())

      expect(await screen.findByText('Select a recipient.')).toBeInTheDocument()
      expect(showErrorToast).toHaveBeenCalledWith(
        'Unable to send test notification',
        'Complete all required fields before sending a test notification.',
      )
      expect(sendEventTestEmailMock).not.toHaveBeenCalled()
    })
  })

  describe('sending to myself', () => {
    it("previews the email addressed to the signed-in user's own address", async () => {
      renderPage()
      await choose('Myself')

      expect(await screen.findByText('Review Notification')).toBeInTheDocument()
      expect(screen.getByText('To: me@gov.bc.ca')).toBeInTheDocument()
    })

    it('sends without naming recipients, so the API uses the signed-in user', async () => {
      renderPage()
      await choose('Myself')
      await screen.findByText('Review Notification')
      await userEvent.click(sendButton())

      await waitFor(() =>
        expect(sendEventTestEmailMock).toHaveBeenCalledWith('event-1', {}, undefined),
      )
      expect(showSuccessToast).toHaveBeenCalledWith('Test notification queued.')
    })

    it('sends the values applied in Edit values as they were previewed', async () => {
      renderPage()
      await choose('Myself')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit values' }))
      await userEvent.click(screen.getByRole('button', { name: 'Apply values' }))

      expect(screen.getByText('Subject: Hello Alice')).toBeInTheDocument()

      await userEvent.click(sendButton())

      await waitFor(() =>
        expect(sendEventTestEmailMock).toHaveBeenCalledWith(
          'event-1',
          // A condition switched off goes as empty, as it did to the preview - not as 'false',
          // which a template treats as true.
          { firstName: 'Alice', isUrgent: '' },
          undefined,
        ),
      )
    })

    it('reports a rejected send with the reason the API gave', async () => {
      sendEventTestEmailMock.mockRejectedValue(
        new Error('Missing personalisation for template ID template-1: firstName'),
      )
      renderPage()
      await choose('Myself')
      await screen.findByText('Review Notification')
      await userEvent.click(sendButton())

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith(
          'Unable to send test notification',
          'Missing personalisation for template ID template-1: firstName',
        ),
      )
      expect(showSuccessToast).not.toHaveBeenCalled()
    })

    it('reports a rejected send that gives no reason', async () => {
      sendEventTestEmailMock.mockRejectedValue('boom')
      renderPage()
      await choose('Myself')
      await screen.findByText('Review Notification')
      await userEvent.click(sendButton())

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith(
          'Unable to send test notification',
          'Something went wrong.',
        ),
      )
    })

    it('shows it is sending while the send is in flight', async () => {
      let resolveSend: () => void = () => {}
      sendEventTestEmailMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSend = resolve
          }),
      )
      renderPage()
      await choose('Myself')
      await screen.findByText('Review Notification')
      await userEvent.click(sendButton())

      expect(await screen.findByRole('button', { name: 'Sending...' })).toBeDisabled()

      resolveSend()
      await waitFor(() => expect(sendButton()).toBeEnabled())
    })
  })

  describe('sending to another recipient', () => {
    it('asks how recipients are added before sending', async () => {
      renderPage()
      await choose('Another recipient')
      await userEvent.click(sendButton())

      expect(await screen.findByText('Choose how to add recipients.')).toBeInTheDocument()
      expect(sendEventTestEmailMock).not.toHaveBeenCalled()
    })

    it('previews as soon as one recipient is chosen, before an address is typed', async () => {
      renderPage()
      await chooseOneRecipient()

      expect(await screen.findByText('Review Notification')).toBeInTheDocument()
    })

    it('requires an address', async () => {
      renderPage()
      await chooseOneRecipient()
      await userEvent.click(sendButton())

      expect(await screen.findByText('Enter an email address.')).toBeInTheDocument()
      expect(sendEventTestEmailMock).not.toHaveBeenCalled()
    })

    it('rejects an address that is not an email address', async () => {
      renderPage()
      await chooseOneRecipient()
      await userEvent.type(
        screen.getByRole('textbox', { name: /Recipient email address/ }),
        'not-an-email',
      )
      await userEvent.click(sendButton())

      expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
      expect(sendEventTestEmailMock).not.toHaveBeenCalled()
    })

    it('clears the address error once the address is edited', async () => {
      renderPage()
      await chooseOneRecipient()
      await userEvent.click(sendButton())
      await screen.findByText('Enter an email address.')

      await userEvent.type(screen.getByRole('textbox', { name: /Recipient email address/ }), 'a')

      expect(screen.queryByText('Enter an email address.')).not.toBeInTheDocument()
    })

    it('sends to the typed address, trimmed', async () => {
      renderPage()
      await chooseOneRecipient()
      await userEvent.type(
        screen.getByRole('textbox', { name: /Recipient email address/ }),
        '  alice@gov.bc.ca ',
      )

      expect(screen.getByText('To: alice@gov.bc.ca')).toBeInTheDocument()

      await userEvent.click(sendButton())

      await waitFor(() =>
        expect(sendEventTestEmailMock).toHaveBeenCalledWith(
          'event-1',
          {},
          {
            to: ['alice@gov.bc.ca'],
          },
        ),
      )
    })
  })

  describe('sending to many recipients from a CSV', () => {
    const upload = (contents: string) =>
      userEvent.upload(screen.getByLabelText('Upload CSV file (required)'), csv(contents))

    it('requires a file', async () => {
      renderPage()
      await chooseManyRecipients()
      await userEvent.click(sendButton(0))

      expect(await screen.findByText('A CSV file is required to continue.')).toBeInTheDocument()
      expect(sendEventTestEmailMock).not.toHaveBeenCalled()
    })

    it('offers the sample CSV for the template', async () => {
      const createObjectURL = vi.fn(() => 'blob:sample')
      const revokeObjectURL = vi.fn()
      Object.assign(URL, { createObjectURL, revokeObjectURL })
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      renderPage()
      await chooseManyRecipients()
      await userEvent.click(await screen.findByRole('button', { name: 'Download sample CSV' }))

      expect(click).toHaveBeenCalled()
      expect(showSuccessToast).toHaveBeenCalledWith(
        'Sample CSV downloaded.',
        'Complete the file and upload it to continue with the test send.',
      )
      click.mockRestore()
    })

    it('keeps only the first five rows, and sends them as a merge', async () => {
      renderPage()
      await chooseManyRecipients()
      await upload(
        [
          'email,firstName',
          'a@gov.bc.ca,A',
          'b@gov.bc.ca,B',
          'c@gov.bc.ca,C',
          'd@gov.bc.ca,D',
          'e@gov.bc.ca,E',
          'f@gov.bc.ca,F',
        ].join('\n'),
      )

      expect(await screen.findByText('All required data passed validation.')).toBeInTheDocument()
      expect(screen.getByText('Email notification 1 of 5')).toBeInTheDocument()

      await userEvent.click(sendButton(5))

      await waitFor(() =>
        expect(sendEventTestEmailMock).toHaveBeenCalledWith(
          'event-1',
          {},
          {
            mergeArray: [
              ['to', 'firstName'],
              ['a@gov.bc.ca', 'A'],
              ['b@gov.bc.ca', 'B'],
              ['c@gov.bc.ca', 'C'],
              ['d@gov.bc.ca', 'D'],
              ['e@gov.bc.ca', 'E'],
            ],
          },
        ),
      )
    })

    it('steps through the rows, rendering each one', async () => {
      renderPage()
      await chooseManyRecipients()
      await upload('email,firstName\na@gov.bc.ca,Ann\nb@gov.bc.ca,Bob')

      expect(await screen.findByText('Subject: Hello Ann')).toBeInTheDocument()
      expect(screen.getByText('To: a@gov.bc.ca')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
      // Uploaded values come from the file, so there is nothing to edit.
      expect(screen.queryByRole('button', { name: 'Edit values' })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(await screen.findByText('Subject: Hello Bob')).toBeInTheDocument()
      expect(screen.getByText('Email notification 2 of 2')).toBeInTheDocument()
      expect(screen.getByText('To: b@gov.bc.ca')).toBeInTheDocument()
      expect(previewTemplateMock).toHaveBeenLastCalledWith('template-1', { firstName: 'Bob' })
      await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled())

      await userEvent.click(screen.getByRole('button', { name: 'Previous' }))

      expect(await screen.findByText('Email notification 1 of 2')).toBeInTheDocument()
    })

    it('blocks the send while a kept row has a problem', async () => {
      renderPage()
      await chooseManyRecipients()
      await upload('email,firstName\nnot-an-email,Ann')

      expect(await screen.findByText('not-an-email')).toBeInTheDocument()

      await userEvent.click(sendButton(1))

      await waitFor(() => expect(showErrorToast).toHaveBeenCalled())
      expect(sendEventTestEmailMock).not.toHaveBeenCalled()
    })

    it('ignores problems on rows past the first five, which are never sent', async () => {
      renderPage()
      await chooseManyRecipients()
      await upload(
        [
          'email,firstName',
          'a@gov.bc.ca,A',
          'b@gov.bc.ca,B',
          'c@gov.bc.ca,C',
          'd@gov.bc.ca,D',
          'e@gov.bc.ca,E',
          'not-an-email,F',
        ].join('\n'),
      )

      expect(await screen.findByText('All required data passed validation.')).toBeInTheDocument()
      expect(screen.queryByText('not-an-email')).not.toBeInTheDocument()
    })

    it('drops the upload when the recipient choice changes', async () => {
      renderPage()
      await chooseManyRecipients()
      await upload('email,firstName\na@gov.bc.ca,Ann')
      await screen.findByText('All required data passed validation.')

      await choose('One recipient')
      await choose('Many recipients (upload a spreadsheet/CSV)')

      expect(screen.queryByText('File uploaded successfully')).not.toBeInTheDocument()
      expect(sendButton(0)).toBeInTheDocument()
    })
  })

  describe('leaving the page', () => {
    it('goes back to the email notification tab', async () => {
      renderPage()
      await userEvent.click(
        await screen.findByRole('button', { name: 'Back to email notifications' }),
      )

      expect(navigateMock).toHaveBeenCalledWith({
        to: '/events/$eventId',
        params: { eventId: 'event-1' },
        search: { tab: 'email' },
      })
    })

    it('only warns about leaving once something has been chosen', async () => {
      renderPage()
      await screen.findByRole('radio', { name: 'Myself' })

      expect(blockerOptions?.shouldBlockFn()).toBe(false)

      await choose('Myself')

      expect(blockerOptions?.shouldBlockFn()).toBe(true)
    })
  })
})
