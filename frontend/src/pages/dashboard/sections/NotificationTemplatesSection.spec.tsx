import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationTemplatesSection } from './NotificationTemplatesSection'
import { getTemplates } from '@/api/templates.api'
import { showErrorToast } from '@/redux/utils/toastUtils'

let state: any

vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))

vi.mock('@/api/templates.api', () => ({
  getTemplates: vi.fn(),
}))

vi.mock('@/redux/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
}))

vi.mock('@/hooks/useCstarRoles', () => ({
  useCstarRoles: () => ({ canEdit: true }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: any) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))

vi.mock('@bcgov/design-system-react-components', () => ({
  Button: ({ children }: any) => <button>{children}</button>,
}))

vi.mock('../../../components/PageSubHeading', () => ({
  default: ({ title }: any) => <h2>{title}</h2>,
}))

function tenant(id: string) {
  return { id, name: id }
}

describe('NotificationTemplatesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTemplates).mockResolvedValue({
      data: [{ id: 1, name: 'Welcome email' }],
    } as any)
  })

  it('fetches the first templates for the selected tenant and renders them', async () => {
    state = { tenant: { selectedTenant: tenant('tenant-1') } }
    render(<NotificationTemplatesSection />)

    expect(await screen.findByText('Welcome email')).toBeInTheDocument()
    expect(getTemplates).toHaveBeenCalledTimes(1)
    expect(getTemplates).toHaveBeenCalledWith(1, 2)
  })

  it('reports a failed fetch', async () => {
    vi.mocked(getTemplates).mockRejectedValue(new Error('Network down'))
    state = { tenant: { selectedTenant: tenant('tenant-1') } }
    render(<NotificationTemplatesSection />)

    await vi.waitFor(() => expect(showErrorToast).toHaveBeenCalledWith('Network down'))
  })

  it('does not fetch when no tenant is selected', () => {
    state = { tenant: { selectedTenant: null } }
    render(<NotificationTemplatesSection />)

    expect(getTemplates).not.toHaveBeenCalled()
  })

  it('re-fetches when the selected tenant changes', async () => {
    state = { tenant: { selectedTenant: tenant('tenant-1') } }
    const { rerender } = render(<NotificationTemplatesSection />)
    await screen.findByText('Welcome email')

    vi.mocked(getTemplates).mockResolvedValue({
      data: [{ id: 2, name: 'Reminder SMS' }],
    } as any)
    state = { tenant: { selectedTenant: tenant('tenant-2') } }
    rerender(<NotificationTemplatesSection />)

    expect(await screen.findByText('Reminder SMS')).toBeInTheDocument()
    expect(getTemplates).toHaveBeenCalledTimes(2)
  })
})
