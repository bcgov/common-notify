import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import McpServers from './McpServers'
import { listMcpServers, saveMcpServer } from '@/api/mcpRegistry.api'
import UserService from '@/service/user-service'

vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn() } }))
vi.mock('@/api/mcpRegistry.api', () => ({ listMcpServers: vi.fn(), saveMcpServer: vi.fn() }))
vi.mock('@/redux/utils/toastUtils', () => ({ showSuccessToast: vi.fn() }))
vi.mock('@/components/PageHeading', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@/components/NotAuthorized', () => ({ default: () => <p>Not authorized</p> }))

describe('MCP server administration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(UserService.hasRole).mockReturnValue(true)
    vi.mocked(listMcpServers).mockResolvedValue([
      {
        name: 'cstar',
        url: 'http://cstar-mcp:3101/mcp',
        protocol: 'streamable-http',
        credentialEnv: 'CSTAR_MCP_API_KEY',
        enabled: false,
        tools: [{ name: 'get_recipients', enabled: true, permittedParameters: ['groupIds'] }],
      },
    ])
    vi.mocked(saveMcpServer).mockResolvedValue({ name: 'cstar' })
  })
  it('lets an administrator enable a server without entering secret values', async () => {
    const user = userEvent.setup()
    render(<McpServers />)
    await user.click(await screen.findByRole('button', { name: 'Edit cstar' }))
    expect(screen.getByLabelText(/Credential environment variable/)).toHaveValue(
      'CSTAR_MCP_API_KEY',
    )
    await user.click(screen.getByLabelText('Server enabled'))
    await user.click(screen.getByRole('button', { name: 'Save server' }))
    await waitFor(() =>
      expect(saveMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'cstar',
          enabled: true,
          credentialEnv: 'CSTAR_MCP_API_KEY',
          tools: [{ name: 'get_recipients', enabled: true, permittedParameters: ['groupIds'] }],
        }),
      ),
    )
  })
  it('does not fetch registry data for a non-admin', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(false)
    render(<McpServers />)
    expect(screen.getByText('Not authorized')).toBeInTheDocument()
    expect(listMcpServers).not.toHaveBeenCalled()
  })
})
