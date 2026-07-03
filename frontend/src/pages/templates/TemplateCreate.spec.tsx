import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type * as TemplatesApi from '@/api/templates.api'
import TemplateCreate from './TemplateCreate'

const navigateMock = vi.fn()
const createTemplateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    createTemplate: (...args: unknown[]) => createTemplateMock(...args),
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

describe('TemplateCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createTemplateMock.mockResolvedValue({})
  })

  it('does not show body type choices', () => {
    render(<TemplateCreate />)

    expect(screen.queryByText('Body type')).toBeNull()
  })

  it('does not require or send bodyType when saving an MJML template', async () => {
    render(<TemplateCreate />)

    fireEvent.click(screen.getByLabelText('Email'))
    fireEvent.click(screen.getByLabelText('MJML'))

    const [titleInput, subjectInput, bodyTextarea] = screen.getAllByRole('textbox')

    fireEvent.change(titleInput, {
      target: { value: 'local mjml final test' },
    })
    fireEvent.change(subjectInput, {
      target: { value: 'Hello {{name}}' },
    })
    fireEvent.change(bodyTextarea, {
      target: {
        value:
          '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>',
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(createTemplateMock).toHaveBeenCalledTimes(1)
    })

    expect(createTemplateMock).toHaveBeenCalledWith({
      name: 'local mjml final test',
      channelCode: 'EMAIL',
      engineCode: 'mjml',
      subject: 'Hello {{name}}',
      body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>',
    })
  })

  it('does not send bodyType when saving a non-MJML template', async () => {
    render(<TemplateCreate />)

    fireEvent.click(screen.getByLabelText('Email'))
    fireEvent.click(screen.getByLabelText('Handlebars'))

    const [titleInput, subjectInput, bodyTextarea] = screen.getAllByRole('textbox')

    fireEvent.change(titleInput, {
      target: { value: 'welcome template' },
    })
    fireEvent.change(subjectInput, {
      target: { value: 'Welcome {{name}}' },
    })
    fireEvent.change(bodyTextarea, {
      target: { value: '# Hello {{name}}' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(createTemplateMock).toHaveBeenCalledTimes(1)
    })

    expect(createTemplateMock).toHaveBeenCalledWith({
      name: 'welcome template',
      channelCode: 'EMAIL',
      engineCode: 'handlebars',
      subject: 'Welcome {{name}}',
      body: '# Hello {{name}}',
    })
  })
})
