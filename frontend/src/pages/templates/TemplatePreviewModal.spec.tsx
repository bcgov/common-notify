import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  NotificationChannel,
  TemplateEngine,
  type PreviewTemplateBodyData,
  type PreviewTemplateResponse,
} from '@/api/templates.api'
import type * as TemplatesApi from '@/api/templates.api'
import TemplatePreviewModal, { detectVariables } from './TemplatePreviewModal'

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

  return { Button, Dialog, Modal, Switch, TextArea, TextField, ToggleButton, ToggleButtonGroup }
})

describe('detectVariables', () => {
  it('detects legacy GC Notify interpolations and conditionals', () => {
    expect(
      detectVariables(
        'Hello ((name))\n((showDetails??Visible content))\n((name??Conditional content))',
        TemplateEngine.LEGACY_GC_NOTIFY,
      ),
    ).toEqual([
      { name: 'name', type: 'boolean' },
      { name: 'showDetails', type: 'boolean' },
    ])
  })

  it('detects Handlebars blocks, helpers, and dotted paths', () => {
    expect(
      detectVariables(
        'Hi {{firstName}} {{#if hasUpdates}}updates{{/if}} {{formatDate user.createdAt}}',
        TemplateEngine.HANDLEBARS,
      ),
    ).toEqual([
      { name: 'firstName', type: 'text' },
      { name: 'hasUpdates', type: 'boolean' },
      { name: 'user.createdAt', type: 'text' },
    ])
  })

  it('detects Mustache sections and inverted sections as booleans', () => {
    expect(
      detectVariables(
        '{{#items}}{{/items}} {{^isArchived}}hidden{{/isArchived}} {{name}}',
        TemplateEngine.MUSTACHE,
      ),
    ).toEqual([
      { name: 'items', type: 'boolean' },
      { name: 'isArchived', type: 'boolean' },
      { name: 'name', type: 'text' },
    ])
  })
})

describe('TemplatePreviewModal apply flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    previewTemplateBodyMock.mockImplementation(
      async ({ params }: PreviewTemplateBodyData): Promise<PreviewTemplateResponse> => ({
        templateId: 'preview',
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

    expect(screen.getByDisplayValue('rendered:Ada:Lovelace')).toBeTruthy()
  })
})
