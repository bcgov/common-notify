import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  NotificationChannel,
  TemplateEngine,
  type PreviewTemplateBodyData,
  type PreviewTemplateBodyResponse,
} from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import TemplatePreviewModal from './TemplatePreviewModal'

const previewTemplateBodyMock = vi.fn()
const getPreviewDataMock = vi.fn()
const savePreviewDataMock = vi.fn()

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    previewTemplateBody: (...args: unknown[]) => previewTemplateBodyMock(...args),
    getTemplatePreviewData: (...args: unknown[]) => getPreviewDataMock(...args),
    saveTemplatePreviewData: (...args: unknown[]) => savePreviewDataMock(...args),
  }
})

vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (state: { tenant: { selectedTenant: { id: string } } }) => unknown) =>
    selector({ tenant: { selectedTenant: { id: 'tenant-a' } } }),
}))

vi.mock('@bcgov/design-system-react-components', async () => {
  const React = await import('react')

  const Button = ({
    children,
    isDisabled,
    onClick,
    onPress,
    type,
    ...props
  }: {
    children: ReactNode
    isDisabled?: boolean
    onClick?: () => void
    onPress?: () => void
    type?: 'button' | 'submit'
    [key: string]: unknown
  }) => (
    <button disabled={isDisabled} onClick={onClick ?? onPress} type={type ?? 'button'} {...props}>
      {children}
    </button>
  )

  const Dialog = ({ children }: { children: ReactNode }) => <div>{children}</div>

  const Modal = ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null

  const Switch = ({
    children,
    isSelected,
    onChange,
  }: {
    children: ReactNode
    isSelected?: boolean
    onChange?: (selected: boolean) => void
  }) => (
    <label>
      <input
        checked={isSelected}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
      {children}
    </label>
  )

  const TextArea = ({
    value,
    isReadOnly: _isReadOnly,
    ...props
  }: {
    value: string
    isReadOnly?: boolean
    [key: string]: unknown
  }) => <textarea readOnly value={value} {...props} />

  const TextField = ({
    label,
    value,
    onChange,
    isInvalid,
    errorMessage,
    isRequired,
    placeholder,
  }: {
    label: ReactNode
    value: string
    onChange: (value: string) => void
    isInvalid?: boolean
    errorMessage?: string
    isRequired?: boolean
    placeholder?: string
  }) => (
    <label>
      <span>{label}</span>
      {isRequired ? <span>(required)</span> : null}
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {isInvalid && errorMessage ? <span>{errorMessage}</span> : null}
    </label>
  )

  const ToggleButtonGroup = ({ children }: { children: ReactNode }) => <div>{children}</div>
  const ToggleButton = ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  )

  const ProgressCircle = ({ 'aria-label': label }: { 'aria-label'?: string }) => (
    <div role="progressbar" aria-label={label} />
  )
  const SvgChevronLeftIcon = () => <svg aria-hidden="true" />
  const SvgChevronRightIcon = () => <svg aria-hidden="true" />

  return {
    Button,
    Dialog,
    Modal,
    ProgressCircle,
    Switch,
    SvgChevronLeftIcon,
    SvgChevronRightIcon,
    TextArea,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
  }
})

describe('TemplatePreviewModal apply flow', () => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    body: 'Hello {{firstName}}',
    subject: '{{lastName}}',
    channelCode: NotificationChannel.EMAIL,
    engineCode: TemplateEngine.HANDLEBARS,
    templateId: 'template-a',
    canSave: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getPreviewDataMock.mockResolvedValue({ params: {} })
    savePreviewDataMock.mockResolvedValue({ params: {} })
    previewTemplateBodyMock.mockImplementation(
      async ({ params }: PreviewTemplateBodyData): Promise<PreviewTemplateBodyResponse> => ({
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: `rendered:${params?.firstName ?? ''}:${params?.lastName ?? ''}`,
        bodyType: 'markdown',
      }),
    )
  })

  it('saves on Apply and restores values after remounting', async () => {
    let saved = { firstName: 'Jane', lastName: 'Doe' }
    getPreviewDataMock.mockImplementation(async () => ({ params: saved }))
    savePreviewDataMock.mockImplementation(async (_id, params) => {
      saved = params
      return { params }
    })
    const view = render(<TemplatePreviewModal {...props} />)
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /firstName/ })).toHaveValue('Jane'),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apply to template/i })).toBeEnabled(),
    )
    fireEvent.change(screen.getByRole('textbox', { name: /firstName/ }), {
      target: { value: 'Ada' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Apply to template/i }))
    await waitFor(() =>
      expect(savePreviewDataMock).toHaveBeenCalledWith('template-a', {
        firstName: 'Ada',
        lastName: 'Doe',
      }),
    )
    view.unmount()
    render(<TemplatePreviewModal {...props} />)
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /firstName/ })).toHaveValue('Ada'),
    )
  })

  it('allows viewer rendering without saving', async () => {
    getPreviewDataMock.mockResolvedValue({ params: { firstName: 'Jane', lastName: 'Doe' } })
    render(<TemplatePreviewModal {...props} canSave={false} />)
    const button = screen.getByRole('button', { name: /Apply to template/i })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    await waitFor(() => expect(previewTemplateBodyMock).toHaveBeenCalled())
    expect(savePreviewDataMock).not.toHaveBeenCalled()
  })

  it('announces load errors and retries before enabling Apply', async () => {
    getPreviewDataMock
      .mockRejectedValueOnce(new Error('Cannot load values'))
      .mockResolvedValueOnce({ params: { firstName: 'Jane' } })
    render(<TemplatePreviewModal {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot load values')
    expect(screen.getByRole('button', { name: /Apply to template/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Retry loading/ }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /firstName/ })).toHaveValue('Jane'),
    )
  })

  it('keeps entered values after a save error and retries on Apply', async () => {
    savePreviewDataMock
      .mockRejectedValueOnce(new Error('Cannot save values'))
      .mockResolvedValueOnce({ params: {} })
    render(<TemplatePreviewModal {...props} />)
    const button = screen.getByRole('button', { name: /Apply to template/i })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.change(screen.getByRole('textbox', { name: /firstName/ }), {
      target: { value: 'Ada' },
    })
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot save values')
    expect(screen.getByRole('textbox', { name: /firstName/ })).toHaveValue('Ada')
    fireEvent.click(button)
    await waitFor(() => expect(savePreviewDataMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('ignores a late load after switching templates', async () => {
    let resolveFirst!: (value: { params: Record<string, string> }) => void
    getPreviewDataMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce({ params: { firstName: 'Second' } })
    const view = render(<TemplatePreviewModal {...props} />)
    view.rerender(<TemplatePreviewModal {...props} templateId="template-b" />)
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /firstName/ })).toHaveValue('Second'),
    )
    resolveFirst({ params: { firstName: 'First' } })
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /firstName/ })).toHaveValue('Second'),
    )
    expect(savePreviewDataMock).not.toHaveBeenCalled()
  })

  it('renders with empty fields, flagging them only once the preview is applied', async () => {
    render(
      <TemplatePreviewModal
        isOpen
        onClose={vi.fn()}
        body="Hello {{firstName}} {{lastName}}"
        channelCode={NotificationChannel.EMAIL}
        engineCode={TemplateEngine.HANDLEBARS}
        subject="Subject"
      />,
    )

    expect(screen.getByText('Show preview')).toBeTruthy()
    expect(screen.queryByText('Subject line:')).toBeNull()

    const applyButton = screen.getByRole('button', { name: /apply to template/i })
    expect(applyButton).toBeEnabled()
    expect(previewTemplateBodyMock).not.toHaveBeenCalled()
    expect(screen.queryByText('This field is empty.')).toBeNull()

    const [firstNameInput, lastNameInput] = screen
      .getAllByRole('textbox')
      .filter((element) => element.tagName === 'INPUT')

    fireEvent.change(firstNameInput, { target: { value: 'Ada' } })
    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(previewTemplateBodyMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { firstName: 'Ada', lastName: '' } }),
      )
    })
    expect(await screen.findByText('rendered:Ada:')).toBeTruthy()
    expect(screen.getAllByText('This field is empty.')).toHaveLength(1)

    fireEvent.change(lastNameInput, { target: { value: 'Lovelace' } })
    expect(screen.queryByText('This field is empty.')).toBeNull()

    await waitFor(() => expect(applyButton).toBeEnabled())
    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(previewTemplateBodyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Hello {{firstName}} {{lastName}}',
          channelCode: NotificationChannel.EMAIL,
          engineCode: TemplateEngine.HANDLEBARS,
          subject: 'Subject',
          params: {
            firstName: 'Ada',
            lastName: 'Lovelace',
          },
        }),
      )
    })

    expect(screen.getByText('rendered:Ada:Lovelace')).toBeTruthy()
  })
})
