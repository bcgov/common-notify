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
const dispatchMock = vi.fn()

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    previewTemplateBody: (...args: unknown[]) => previewTemplateBodyMock(...args),
  }
})

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (
    selector: (state: { templates: { previewValues: Record<string, string> } }) => unknown,
  ) => selector({ templates: { previewValues: {} } }),
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
  beforeEach(() => {
    vi.clearAllMocks()
    previewTemplateBodyMock.mockImplementation(
      async ({ params }: PreviewTemplateBodyData): Promise<PreviewTemplateBodyResponse> => ({
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: `rendered:${params?.firstName ?? ''}:${params?.lastName ?? ''}`,
        bodyType: 'markdown',
      }),
    )
  })

  it('enables apply after a value is entered and surfaces missing-field validation', async () => {
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

    const applyButton = screen.getByRole('button', { name: /apply to preview/i })
    expect(applyButton).toBeDisabled()

    const [firstNameInput, lastNameInput] = screen
      .getAllByRole('textbox')
      .filter((element) => element.tagName === 'INPUT')

    fireEvent.change(firstNameInput, { target: { value: 'Ada' } })

    expect(applyButton).toBeEnabled()

    fireEvent.click(applyButton)

    expect(previewTemplateBodyMock).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a value to generate the preview')).toBeTruthy()

    fireEvent.change(lastNameInput, { target: { value: 'Lovelace' } })
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
