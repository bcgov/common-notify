import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import tenantReducer from '@/redux/slices/tenant.slice'
import userReducer from '@/redux/slices/user.slice'
import { NotificationChannel, TemplateEngine } from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import type * as BulkNotificationsApi from '@/api/bulkNotifications.api'
import BulkNotifications from './BulkNotifications'
import { showInfoToast, showSuccessToast } from '@/redux/utils/toastUtils'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

// SMS availability is a feature flag; default it on and let one test turn it off.
const featureFlagMock = vi.fn(() => true)
vi.mock('@/config/featureFlags/useFeatureFlag', () => ({
  useFeatureFlag: (code: string) => featureFlagMock(code),
}))

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showInfoToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

const getTemplatesMock = vi.fn()
const previewTemplateMock = vi.fn()
const getTemplateByIdMock = vi.fn()
const sendBulkMock = vi.fn()

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    getTemplates: (...args: unknown[]) => getTemplatesMock(...args),
    previewTemplate: (...args: unknown[]) => previewTemplateMock(...args),
    getTemplateById: (...args: unknown[]) => getTemplateByIdMock(...args),
  }
})

vi.mock('@/api/bulkNotifications.api', async () => {
  const actual = await vi.importActual<typeof BulkNotificationsApi>('@/api/bulkNotifications.api')
  return {
    ...actual,
    sendBulkNotifications: (...args: unknown[]) => sendBulkMock(...args),
  }
})

// The header reads the store; it has its own spec.
vi.mock('@/components/EmailHeader', () => ({ default: () => <div>Email header</div> }))

// The design system's Select and Button are react-aria components; swapped for plain markup so the
// test drives the page, not the library.
vi.mock('@bcgov/design-system-react-components', () => {
  const Button = ({
    children,
    onPress,
    isDisabled,
    ...rest
  }: {
    children: ReactNode
    onPress?: () => void
    isDisabled?: boolean
    [key: string]: unknown
  }) => (
    <button type="button" onClick={onPress} disabled={isDisabled} {...rest}>
      {children}
    </button>
  )

  const Select = ({
    label,
    items = [],
    value,
    onChange,
    isDisabled,
    isRequired,
  }: {
    label: string
    items?: { id: string; label: string }[]
    value?: string
    onChange?: (key: string) => void
    isDisabled?: boolean
    isRequired?: boolean
  }) => (
    <label>
      <span>{isRequired ? `${label} (required)` : label}</span>
      <select
        value={value ?? ''}
        disabled={isDisabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">Select a template...</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )

  const Dialog = ({ children }: { children: ReactNode }) => <div>{children}</div>
  // The dismiss button stands in for Escape or a click outside, which the real modal handles.
  const Modal = ({
    isOpen,
    onOpenChange,
    children,
  }: {
    isOpen: boolean
    onOpenChange?: (open: boolean) => void
    children: ReactNode
  }) =>
    isOpen ? (
      <div>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Dismiss modal
        </button>
        {children}
      </div>
    ) : null
  const TextArea = ({ value, ...props }: { value: string; [key: string]: unknown }) => (
    <textarea readOnly value={value} {...props} />
  )
  const TextField = ({
    label,
    value,
    isInvalid,
    errorMessage,
  }: {
    label: string
    value: string
    isInvalid?: boolean
    errorMessage?: string
  }) => (
    <label>
      <span>{label}</span>
      <input readOnly value={value} />
      {isInvalid && errorMessage ? <span>{errorMessage}</span> : null}
    </label>
  )

  const RadioGroup = ({
    label,
    isRequired,
    description,
    value,
    onChange,
    children,
  }: {
    label: string
    isRequired?: boolean
    description?: string
    value?: string
    onChange?: (value: string) => void
    children: ReactNode
  }) => (
    <fieldset>
      <legend>{isRequired ? `${label} (required)` : label}</legend>
      {description ? <p>{description}</p> : null}
      <div
        onChange={(event) => onChange?.((event.target as HTMLInputElement).value)}
        data-value={value}
      >
        {children}
      </div>
    </fieldset>
  )

  const Radio = ({
    value,
    children,
    isDisabled,
  }: {
    value: string
    children: ReactNode
    isDisabled?: boolean
  }) => (
    <label>
      <input type="radio" name="channel" value={value} disabled={isDisabled} />
      {children}
    </label>
  )

  const Callout = ({ title, description }: { title?: string; description?: string }) => (
    <div>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )

  const InlineAlert = ({
    title,
    description,
    variant,
    isCloseable,
    onClose,
  }: {
    title?: string
    description?: string
    variant?: string
    isCloseable?: boolean
    onClose?: () => void
  }) => (
    <div role="status" data-variant={variant}>
      <strong>{title}</strong>
      <span>{description}</span>
      {isCloseable ? (
        <button type="button" onClick={onClose}>
          Close this alert
        </button>
      ) : null}
    </div>
  )

  const ProgressCircle = ({ 'aria-label': label }: { 'aria-label'?: string }) => (
    <div role="progressbar" aria-label={label} />
  )
  const SvgChevronLeftIcon = () => <svg aria-hidden="true" />
  const SvgChevronRightIcon = () => <svg aria-hidden="true" />
  const SvgCheckCircleIcon = () => <svg aria-hidden="true" />

  return {
    Button,
    ProgressCircle,
    SvgCheckCircleIcon,
    SvgChevronLeftIcon,
    SvgChevronRightIcon,
    Select,
    Dialog,
    Modal,
    TextArea,
    TextField,
    Radio,
    RadioGroup,
    Callout,
    InlineAlert,
  }
})

const emailTemplate = {
  id: 'template-1',
  name: 'Permit Renewal',
  channelCode: NotificationChannel.EMAIL,
  subject: 'Your {{permitType}} permit',
  body: 'Hello {{firstName}}, your permit expires soon.',
  engineCode: TemplateEngine.HANDLEBARS,
  version: 1,
  active: true,
  createdBy: 'someone',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'someone',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

function makeStore(cstarRoles: string[] = ['NOTIFY_OPERATIONS_ADMIN']) {
  return configureStore({
    reducer: { tenant: tenantReducer, user: userReducer },
    preloadedState: {
      tenant: {
        selectedTenant: { id: 'tenant-1', name: 'Test Tenant' } as any,
        showTenantModal: false,
      },
      user: {
        current: { cstarRoles } as any,
        isLoading: false,
        rolesLoading: false,
        rolesTenantId: null,
        error: null,
        rolesError: null,
      },
    },
  })
}

function renderPage(cstarRoles?: string[]) {
  return render(
    <Provider store={makeStore(cstarRoles)}>
      <BulkNotifications />
    </Provider>,
  )
}

async function chooseEmailChannel() {
  await userEvent.click(await screen.findByRole('radio', { name: 'Email notification' }))
}

async function chooseTemplate() {
  await chooseEmailChannel()
  const select = await screen.findByRole('combobox', { name: /template/i })
  await userEvent.selectOptions(select, 'template-1')
}

function csv(contents: string) {
  return new File([contents], 'recipients.csv', { type: 'text/csv' })
}

describe('BulkNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    featureFlagMock.mockReturnValue(true)
    getTemplatesMock.mockResolvedValue({
      data: [emailTemplate],
      count: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    })
    // The columns come from the API, not from parsing the template in the browser.
    getTemplateByIdMock.mockResolvedValue({
      ...emailTemplate,
      placeholders: { paths: ['permitType', 'firstName'], unsupported: [] },
    })
    sendBulkMock.mockResolvedValue({
      notifyId: 'notify-1',
      status: 'accepted',
      channels: ['email'],
      createdAt: '2026-08-28T00:00:00.000Z',
      message: 'Email merge send accepted with 2 recipient(s)',
      recipientCount: 2,
    })
    previewTemplateMock.mockResolvedValue({
      templateId: 'template-1',
      channelCode: NotificationChannel.EMAIL,
      from: 'notify_noreply@gov.bc.ca',
      subject: 'Your parking permit',
      body: 'Hello Alice, your permit expires soon.',
      bodyType: 'markdown',
    })
  })

  it('requests templates for the chosen channel, not before one is chosen', async () => {
    renderPage()

    await screen.findByRole('radio', { name: 'Email notification' })
    // Fetching on mount would show email templates to someone about to pick SMS.
    expect(getTemplatesMock).not.toHaveBeenCalled()

    await chooseEmailChannel()

    await waitFor(() =>
      expect(getTemplatesMock).toHaveBeenCalledWith(1, 100, undefined, 'name', [
        'channelCode:eq:EMAIL',
      ]),
    )
  })

  it('requests SMS templates when the SMS channel is chosen', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'SMS notification' }))

    await waitFor(() =>
      expect(getTemplatesMock).toHaveBeenCalledWith(1, 100, undefined, 'name', [
        'channelCode:eq:SMS',
      ]),
    )
  })

  it('offers SMS when the tenant has the SMS channel', async () => {
    renderPage()

    expect(await screen.findByRole('radio', { name: 'Email notification' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'SMS notification' })).toBeEnabled()
  })

  it('disables SMS when the tenant does not have the channel, and says why', async () => {
    featureFlagMock.mockImplementation((code: string) => code !== 'sms_notifications')
    renderPage()

    expect(await screen.findByRole('radio', { name: 'SMS notification' })).toBeDisabled()
    expect(screen.getByText('SMS is not enabled for this tenant.')).toBeInTheDocument()
  })

  it('asks for a channel before it offers a template', async () => {
    renderPage()

    await screen.findByRole('radio', { name: 'Email notification' })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await chooseEmailChannel()

    expect(await screen.findByRole('combobox', { name: /template/i })).toBeInTheDocument()
  })

  it('shows the raw template so the user can see which placeholders to fill in', async () => {
    renderPage()
    await chooseTemplate()

    expect(await screen.findByText('Your {{permitType}} permit')).toBeInTheDocument()
    expect(screen.getByText(/Hello \{\{firstName\}\}/)).toBeInTheDocument()
  })

  it('builds columns from the API report, dotted paths included', async () => {
    getTemplateByIdMock.mockResolvedValue({
      ...emailTemplate,
      placeholders: { paths: ['alert.id', 'recipient.firstName'], unsupported: [] },
    })

    renderPage()
    await chooseTemplate()

    // A file matching the API's paths validates; the old client-side guess dropped dotted paths
    // entirely, so this file would have been rejected as having unexpected columns.
    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,alert.id,recipient.firstName\nalice@gov.bc.ca,A-1,Alice'),
    )

    expect(await screen.findByText('All required data passed validation.')).toBeInTheDocument()
  })

  it('refuses a template that repeats a list, which a spreadsheet cannot supply', async () => {
    getTemplateByIdMock.mockResolvedValue({
      ...emailTemplate,
      placeholders: { paths: ['alert.id'], unsupported: ['recommendations', 'moose'] },
    })

    renderPage()
    await chooseTemplate()

    expect(
      await screen.findByText("This template can't be used for a batch send."),
    ).toBeInTheDocument()
    expect(screen.getByText(/recommendations, moose/)).toBeInTheDocument()
    // No upload control is offered, and nothing can be sent.
    expect(screen.queryByLabelText('Upload CSV file (required)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send notifications' })).toBeDisabled()
  })

  it('confirms validation passed once a good file is uploaded', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice\nbob@gov.bc.ca,parking,Bob'),
    )

    expect(await screen.findByText('All required data passed validation.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send notifications' })).toBeEnabled()
  })

  it('reports row problems in a table and blocks sending', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nlisa.thompson@govbcca,parking,Lisa'),
    )

    expect(await screen.findByText('1 item requires attention.')).toBeInTheDocument()
    expect(screen.getByText('lisa.thompson@govbcca')).toBeInTheDocument()
    expect(screen.getByText('Invalid format')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send notifications' })).toBeDisabled()
  })

  it('warns about empty placeholders but still lets the file be sent', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,,Alice'),
    )

    expect(await screen.findByText('1 item requires attention.')).toBeInTheDocument()
    expect(screen.getByText('Missing or invalid value')).toBeInTheDocument()
    expect(screen.queryByText('All required data passed validation.')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Send notifications' }))

    await waitFor(() =>
      expect(sendBulkMock).toHaveBeenCalledWith(
        'template-1',
        [
          ['to', 'permitType', 'firstName'],
          ['alice@gov.bc.ca', '', 'Alice'],
        ],
        'email',
      ),
    )
  })

  it('rejects a structurally wrong file outright, in the design wording', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('permitType,firstName\nparking,Alice'),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your CSV file is missing required column called 'email'.",
    )
    // The drop zone goes back to empty: there is nothing to review row by row, so keeping a
    // "File uploaded successfully" chip beside a red error would contradict itself.
    expect(screen.getByText('Choose a file or drag and drop here')).toBeInTheDocument()
    expect(screen.queryByText('File uploaded successfully')).not.toBeInTheDocument()
  })

  it('keeps a file whose rows need fixing, so it can be reviewed against the table', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nlisa.thompson@govbcca,parking,Lisa'),
    )

    expect(await screen.findByText('File uploaded successfully')).toBeInTheDocument()
    expect(screen.getByText('recipients.csv')).toBeInTheDocument()
  })

  it('sorts the issue table when a column header is used', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv(
        'email,permitType,firstName\n' +
          'bad-one,parking,Alice\n' +
          'alice@gov.bc.ca,,Bob\n' +
          'also-bad,parking,Carol',
      ),
    )

    await screen.findByText('3 items require attention.')

    const rowNumbers = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelectorAll('td')[0]?.textContent)

    expect(rowNumbers()).toEqual(['2', '3', '4'])

    await userEvent.click(screen.getByRole('button', { name: /column options for row/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'High to Low' }))

    expect(rowNumbers()).toEqual(['4', '3', '2'])
  })

  it('states each issue as a title with the fix beneath it', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nbad-one,parking,Alice'),
    )

    await screen.findByText('1 item requires attention.')

    expect(screen.getByText('Invalid format')).toBeInTheDocument()
    expect(
      screen.getByText('Use a single @ with a domain after it, like name@example.com.'),
    ).toBeInTheDocument()
  })

  it('renames the recipient column to the one the API expects when sending', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice\nbob@gov.bc.ca,parking,Bob'),
    )
    await screen.findByText('All required data passed validation.')
    await userEvent.click(screen.getByRole('button', { name: 'Send notifications' }))

    await waitFor(() =>
      expect(sendBulkMock).toHaveBeenCalledWith(
        'template-1',
        [
          ['to', 'permitType', 'firstName'],
          ['alice@gov.bc.ca', 'parking', 'Alice'],
          ['bob@gov.bc.ca', 'parking', 'Bob'],
        ],
        'email',
      ),
    )
    expect(await screen.findByText('2 notifications queued')).toBeInTheDocument()
  })

  it('reports recipients the safelist dropped alongside the queued count', async () => {
    sendBulkMock.mockResolvedValue({
      notifyId: 'notify-1',
      status: 'accepted',
      channels: ['email'],
      createdAt: '2026-08-28T00:00:00.000Z',
      message: 'Email merge send accepted with 1 recipient(s)',
      recipientCount: 1,
      blockedRecipientCount: 1,
      blockedMessage:
        '1 recipient(s) were not sent to because they are not on this tenant safelist',
    })

    renderPage()
    await chooseTemplate()
    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice\nbob@gov.bc.ca,parking,Bob'),
    )
    await screen.findByText('All required data passed validation.')
    await userEvent.click(screen.getByRole('button', { name: 'Send notifications' }))

    expect(await screen.findByText('1 notification queued')).toBeInTheDocument()
    expect(screen.getByText(/not on this tenant safelist/)).toBeInTheDocument()
  })

  it('says a repeat of a recent batch was already sent, rather than queued again', async () => {
    sendBulkMock.mockResolvedValue({
      notifyId: 'original-notify-id',
      status: 'completed',
      channels: ['email'],
      createdAt: '2026-08-28T00:00:00.000Z',
      message: 'An identical notification was already accepted',
      duplicate: true,
    })

    renderPage()
    await chooseTemplate()
    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice\nbob@gov.bc.ca,parking,Bob'),
    )
    await screen.findByText('All required data passed validation.')
    await userEvent.click(screen.getByRole('button', { name: 'Send notifications' }))

    expect(await screen.findByRole('heading', { name: 'Already sent' })).toBeInTheDocument()
    expect(screen.getByText(/nothing new was sent/)).toBeInTheDocument()
    expect(screen.queryByText(/queued/)).not.toBeInTheDocument()
    expect(showInfoToast).toHaveBeenCalledWith('Already sent. Nothing new was sent.')
    expect(showSuccessToast).not.toHaveBeenCalled()
  })

  it('previews a recipient with that row values substituted', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice'),
    )
    await screen.findByText('All required data passed validation.')
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

    await waitFor(() =>
      expect(previewTemplateMock).toHaveBeenCalledWith('template-1', {
        permitType: 'parking',
        firstName: 'Alice',
      }),
    )
  })

  it('previews a dotted-path template with the nested params the renderer needs', async () => {
    getTemplateByIdMock.mockResolvedValue({
      ...emailTemplate,
      placeholders: { paths: ['alert.id', 'recipient.firstName'], unsupported: [] },
    })

    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,alert.id,recipient.firstName\nalice@gov.bc.ca,A-1,Alice'),
    )
    await screen.findByText('All required data passed validation.')
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

    // Flat keys would render empty and fail the personalisation check with a 400.
    await waitFor(() =>
      expect(previewTemplateMock).toHaveBeenCalledWith('template-1', {
        alert: { id: 'A-1' },
        recipient: { firstName: 'Alice' },
      }),
    )
    expect(await screen.findByText('Your parking permit')).toBeInTheDocument()
    // The sender comes from the preview response, so it is the address the send will really use.
    expect(screen.getByText('notify_noreply@gov.bc.ca')).toBeInTheDocument()
  })

  it('previews the email under its header, in the same frame as the event previews', async () => {
    previewTemplateMock.mockResolvedValue({
      subject: 'Your parking permit',
      body: 'Hello Alice',
      html: '<p>Hello Alice</p>',
    })
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice'),
    )
    await screen.findByText('All required data passed validation.')
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

    const frame = await screen.findByTitle('Rendered email')
    expect(frame.getAttribute('srcdoc')).toContain('<p>Hello Alice</p>')
    expect(screen.getByText('Email header')).toBeInTheDocument()
    expect(screen.queryByText(/Some fields are empty/)).not.toBeInTheDocument()
    expect(screen.queryByText('This field is empty.')).not.toBeInTheDocument()
  })

  it('warns about empty fields anywhere in the file, flagging them only on their row', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice\nbob@gov.bc.ca,parking,'),
    )
    await screen.findByText('1 item requires attention.')
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

    // The first row is complete, but the send as a whole is not.
    expect(await screen.findByText(/^Some fields are empty\. You can still send/)).toBeVisible()
    expect(screen.queryByText('This field is empty.')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Send notification (2)' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Email notification 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('This field is empty.')).toBeInTheDocument()
    expect(screen.getByText(/^Some fields are empty/)).toBeVisible()
  })

  it('keeps the empty field warning dismissed until the preview is reopened', async () => {
    renderPage()
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,\nbob@gov.bc.ca,parking,'),
    )
    await screen.findByText('2 items require attention.')
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await screen.findByText(/^Some fields are empty/)

    await userEvent.click(screen.getByRole('button', { name: 'Close this alert' }))

    expect(screen.queryByText(/^Some fields are empty/)).not.toBeInTheDocument()
    // The field stays flagged: only the banner was dismissed.
    expect(screen.getByText('This field is empty.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Email notification 2 of 2')).toBeInTheDocument()
    expect(screen.queryByText(/^Some fields are empty/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss modal' }))
    expect(screen.queryByText('Email notification 2 of 2')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByText(/^Some fields are empty/)).toBeVisible()
  })

  it('lets a template editor send, the same as an operations admin', async () => {
    renderPage(['NOTIFY_TEMPLATE_EDITOR'])
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice'),
    )
    await screen.findByText('All required data passed validation.')

    expect(screen.queryByText(/needs the Template Editor or Tenant Administrator role/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Send notifications' })).toBeEnabled()
  })

  it('lets a viewer download a sample but not send', async () => {
    renderPage(['NOTIFY_VIEWER'])
    await chooseTemplate()

    await userEvent.upload(
      screen.getByLabelText('Upload CSV file (required)'),
      csv('email,permitType,firstName\nalice@gov.bc.ca,parking,Alice'),
    )
    await screen.findByText('All required data passed validation.')

    expect(
      screen.getByText(/needs the Template Editor or Tenant Administrator role/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send notifications' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Download sample CSV' })).toBeEnabled()
  })
})
