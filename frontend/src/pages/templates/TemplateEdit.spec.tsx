import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type * as TemplatesApi from '@/api/templates.api'
import TemplateEdit from './TemplateEdit'

const navigateMock = vi.fn()
const getTemplateByIdMock = vi.fn()
const updateTemplateMock = vi.fn()
const useCstarRolesMock = vi.fn(() => ({ primaryRole: 'NOTIFY_ADMIN' }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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

vi.mock('@/hooks/useCstarRoles', () => ({
  useCstarRoles: () => ({ primaryRole: 'NOTIFY_USER' }),
}))

vi.mock('@/components/PageHeading', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@/hooks/useCstarRoles', () => ({
  useCstarRoles: () => useCstarRolesMock(),
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
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
    useCstarRolesMock.mockReturnValue({ primaryRole: 'NOTIFY_ADMIN' })
    getTemplateByIdMock.mockResolvedValue(template)
    updateTemplateMock.mockResolvedValue({})
  })

  it('renders the edit breadcrumb with links and a current-page item', async () => {
    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(
        screen.getByText('Edit reusable template', { selector: '[aria-current="page"]' }),
      ).toBeTruthy()
    })

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/templates')
  })

  it('does not show body type choices', async () => {
    getTemplateByIdMock.mockResolvedValue(template)

    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(getTemplateByIdMock).toHaveBeenCalledWith('template-123')
    })

    expect(screen.queryByText('Body type')).toBeNull()
  })

  it('shows the Figma template title placeholder', async () => {
    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a template title')).toBeTruthy()
    })
  })

  it('keeps preview disabled and shows inline errors for missing required fields', async () => {
    const { container } = render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Welcome Template')).toBeTruthy()
    })

    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Template body (required)'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateTemplateMock).not.toHaveBeenCalled()
    })

    expect(screen.getByText('Please fill out this field to continue.')).toBeTruthy()
    expect(container.querySelectorAll('.bcds-react-aria-TextField--Error')).toHaveLength(1)
  })

  it('preserves read-only view mode behavior', async () => {
    useCstarRolesMock.mockReturnValue({ primaryRole: 'NOTIFY_VIEWER' })

    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'View reusable template' })).toBeTruthy()
    })

    expect(
      screen.getByText('View reusable template', { selector: '[aria-current="page"]' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()
  })

  it('renders all syntax tooltip triggers', async () => {
    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'About Handlebars syntax' })).toBeTruthy()
    })

    expect(screen.getByRole('button', { name: 'About Mustache syntax' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About GC Notify legacy syntax' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About MJML syntax' })).toBeTruthy()
  })

  it('shows the inline template ID row and copies it to the clipboard', async () => {
    render(<TemplateEdit templateId="template-123" />)

    await waitFor(() => {
      expect(screen.getByText('API data: Template ID')).toBeTruthy()
    })

    expect(screen.getByText('template-123')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copy template ID to clipboard' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('template-123')
    })

    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
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
