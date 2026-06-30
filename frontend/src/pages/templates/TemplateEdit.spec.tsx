import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type * as TemplatesApi from '@/api/templates.api'
import TemplateEdit from './TemplateEdit'

const navigateMock = vi.fn()
const getTemplateByIdMock = vi.fn()
const updateTemplateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    getTemplateById: (...args: unknown[]) => getTemplateByIdMock(...args),
    updateTemplate: (...args: unknown[]) => updateTemplateMock(...args),
  }
})

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

vi.mock('@/components/PageHeading', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@bcgov/design-system-react-components', async () => {
  const React = await import('react')

  const Button = ({
    children,
    onClick,
    onPress,
    type,
    isDisabled,
  }: {
    children: ReactNode
    onClick?: () => void
    onPress?: () => void
    type?: 'button' | 'submit'
    isDisabled?: boolean
  }) => (
    <button disabled={isDisabled} onClick={onClick ?? onPress} type={type ?? 'button'}>
      {children}
    </button>
  )

  const TextField = ({
    label,
    value,
    onChange,
    description,
    errorMessage,
  }: {
    label: ReactNode
    value: string
    onChange: (value: string) => void
    description?: string
    errorMessage?: string
  }) => (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
      {description ? <span>{description}</span> : null}
      {errorMessage ? <span>{errorMessage}</span> : null}
    </label>
  )

  const Radio = ({
    value,
    children,
    checked,
    onSelect,
    disabled,
  }: {
    value: string
    children: ReactNode
    checked?: boolean
    onSelect?: (value: string) => void
    disabled?: boolean
  }) => (
    <label>
      <input
        checked={checked}
        disabled={disabled}
        name="radio-group"
        onChange={() => onSelect?.(value)}
        type="radio"
      />
      {children}
    </label>
  )

  const RadioGroup = ({
    label,
    value,
    onChange,
    children,
    errorMessage,
    isDisabled,
  }: {
    label: ReactNode
    value: string
    onChange: (value: string) => void
    children: ReactNode
    errorMessage?: string
    isDisabled?: boolean
  }) => (
    <fieldset disabled={isDisabled}>
      <legend>{label}</legend>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              checked: child.props.value === value,
              onSelect: onChange,
              disabled: isDisabled,
            })
          : child,
      )}
      {errorMessage ? <span>{errorMessage}</span> : null}
    </fieldset>
  )

  return { Button, Radio, RadioGroup, TextField }
})

const template = {
  id: 'template-123',
  name: 'Welcome Template',
  channelCode: 'EMAIL',
  engineCode: 'handlebars',
  bodyType: 'markdown',
  subject: 'Hello {{name}}',
  body: 'Hello {{name}}',
  version: 1,
  active: true,
  createdBy: 'user',
  createdAt: '2026-01-01T00:00:00Z',
  updatedBy: 'user',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('TemplateEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTemplateByIdMock.mockResolvedValue(template)
    updateTemplateMock.mockResolvedValue({})
  })

  it('does not show body type choices', async () => {
    getTemplateByIdMock.mockResolvedValue(template)

    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(getTemplateByIdMock).toHaveBeenCalledWith('template-123')
    })

    expect(screen.queryByText('Body type')).toBeNull()
  })

  it('does not require or send bodyType when saving an MJML template', async () => {
    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Welcome Template')).toBeTruthy()
    })

    fireEvent.click(screen.getByLabelText('MJML'))
    fireEvent.change(screen.getByLabelText('Template body (required)'), {
      target: {
        value:
          '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>',
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateTemplateMock).toHaveBeenCalledTimes(1)
    })

    expect(updateTemplateMock).toHaveBeenCalledWith('template-123', {
      name: 'Welcome Template',
      engineCode: 'mjml',
      subject: 'Hello {{name}}',
      body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>',
    })
  })

  it('does not send bodyType when saving a non-MJML template', async () => {
    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Welcome Template')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Template body (required)'), {
      target: { value: '# Updated {{name}}' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateTemplateMock).toHaveBeenCalledTimes(1)
    })

    expect(updateTemplateMock).toHaveBeenCalledWith('template-123', {
      name: 'Welcome Template',
      engineCode: 'handlebars',
      subject: 'Hello {{name}}',
      body: '# Updated {{name}}',
    })
  })
})
