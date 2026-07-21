import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type * as TemplatesApi from '@/api/templates.api'
import TemplateCreate from './TemplateCreate'

const navigateMock = vi.fn()
const createTemplateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
  type RadioOptionProps = {
    value: string
    checked?: boolean
    onSelect?: (value: string) => void
    disabled?: boolean
  }
  type NestedRadioChildProps = {
    value?: string
    children?: ReactNode
  }

  const Button = ({
    className,
    children,
    isIconButton,
    onClick,
    onPress,
    size,
    type,
    isDisabled,
    variant,
    ...props
  }: {
    className?: string
    children: ReactNode
    isIconButton?: boolean
    onClick?: () => void
    onPress?: () => void
    size?: string
    type?: 'button' | 'submit'
    isDisabled?: boolean
    variant?: string
    [key: string]: unknown
  }) => {
    void isIconButton
    void size
    void variant

    return (
      <button
        className={className}
        disabled={isDisabled}
        onClick={onClick ?? onPress}
        {...props}
        type={type ?? 'button'}
      >
        {children}
      </button>
    )
  }

  const TextField = ({
    label,
    value,
    onChange,
    description,
    errorMessage,
    isRequired,
    placeholder,
  }: {
    label: ReactNode
    value: string
    onChange: (value: string) => void
    description?: string
    errorMessage?: string
    isRequired?: boolean
    placeholder?: string
  }) => (
    <label>
      {isRequired ? `${label} (required)` : label}
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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

  const enhanceRadioChildren = (
    children: ReactNode,
    value: string,
    onChange: (value: string) => void,
    isDisabled?: boolean,
  ): ReactNode =>
    React.Children.map(children, (child) => {
      if (!React.isValidElement<NestedRadioChildProps>(child)) {
        return child
      }

      const childProps = child.props

      if (typeof childProps.value === 'string') {
        return React.cloneElement(child as React.ReactElement<RadioOptionProps>, {
          checked: childProps.value === value,
          onSelect: onChange,
          disabled: isDisabled,
        })
      }

      if (childProps.children !== undefined) {
        return React.cloneElement(child, {
          children: enhanceRadioChildren(childProps.children, value, onChange, isDisabled),
        })
      }

      return child
    })

  const RadioGroup = ({
    label,
    value,
    onChange,
    children,
    errorMessage,
    isDisabled,
    isRequired,
  }: {
    label: ReactNode
    value: string
    onChange: (value: string) => void
    children: ReactNode
    errorMessage?: string
    isDisabled?: boolean
    isRequired?: boolean
  }) => (
    <fieldset disabled={isDisabled}>
      <legend>{isRequired ? `${label} (required)` : label}</legend>
      {enhanceRadioChildren(children, value, onChange, isDisabled)}
      {errorMessage ? <span>{errorMessage}</span> : null}
    </fieldset>
  )

  const TooltipTrigger = ({ children }: { children: ReactNode }) => <>{children}</>

  const Tooltip = ({ children }: { children: ReactNode }) => <span>{children}</span>

  const SvgInfoIcon = () => <svg aria-hidden="true" />

  return { Button, Radio, RadioGroup, SvgInfoIcon, TextField, Tooltip, TooltipTrigger }
})

describe('TemplateCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createTemplateMock.mockResolvedValue({ id: 'new-template-123' })
  })

  it('renders the create breadcrumb with links and a current-page item', () => {
    render(<TemplateCreate />)

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/templates')
    expect(
      screen.getByText('Create reusable template', { selector: '[aria-current="page"]' }),
    ).toBeTruthy()
  })

  it('does not show body type choices', () => {
    render(<TemplateCreate />)

    expect(screen.queryByText('Body type')).toBeNull()
  })

  it('shows the Figma template title placeholder', () => {
    render(<TemplateCreate />)

    expect(screen.getByPlaceholderText('Type a template title')).toBeTruthy()
  })

  it('keeps preview disabled and shows inline errors for missing required fields', async () => {
    const { container } = render(<TemplateCreate />)

    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'Missing fields template' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createTemplateMock).not.toHaveBeenCalled()
    expect(screen.getAllByText('Please select an option to continue.')).toHaveLength(2)
    expect(screen.getByText('Please fill out this field to continue.')).toBeTruthy()
    expect(container.querySelectorAll('.bcds-react-aria-TextField--Error')).toHaveLength(1)
  })

  it('enables save after entering a title and still requires the remaining fields on submit', () => {
    render(<TemplateCreate />)

    const saveButton = screen.getByRole('button', { name: 'Save' })
    const titleInput = screen.getByPlaceholderText('Type a template title')

    expect(saveButton).toBeDisabled()

    fireEvent.change(titleInput, {
      target: { value: 'Email template' },
    })
    expect(saveButton).not.toBeDisabled()

    fireEvent.click(saveButton)

    expect(createTemplateMock).not.toHaveBeenCalled()
  })

  it('shows an inline required error for email subject when email is selected', () => {
    render(<TemplateCreate />)

    fireEvent.change(screen.getByPlaceholderText('Type a template title'), {
      target: { value: 'Email template' },
    })
    fireEvent.click(screen.getByLabelText('Email'))
    fireEvent.click(screen.getByLabelText('Handlebars'))
    fireEvent.change(screen.getByLabelText('Template body (required)'), {
      target: { value: 'Hello {{name}}' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createTemplateMock).not.toHaveBeenCalled()
    expect(
      screen.getByText('Use a subject line that clearly describes the email content.'),
    ).toBeTruthy()
    expect(screen.getByText('Please fill out this field to continue.')).toBeTruthy()
  })

  it('renders all syntax tooltip triggers', () => {
    render(<TemplateCreate />)

    expect(screen.getByRole('button', { name: 'About Handlebars syntax' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About Mustache syntax' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About GC Notify legacy syntax' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About MJML syntax' })).toBeTruthy()
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

  it('navigates to the new template edit page after create', async () => {
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
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/template-edit/$templateId',
        params: { templateId: 'new-template-123' },
      })
    })
  })
})
