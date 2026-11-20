import { render, screen, waitFor, within } from '@testing-library/react'
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
  it('saves server configuration without a separate feature enable switch', async () => {
    const user = userEvent.setup()
    render(<McpServers />)
    await user.click(await screen.findByRole('button', { name: 'Edit cstar' }))
    expect(screen.getByLabelText(/Credential environment variable/)).toHaveValue(
      'CSTAR_MCP_API_KEY',
    )
    expect(screen.queryByLabelText('Server enabled')).not.toBeInTheDocument()
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
  it('creates a server and edits tool permissions without sending editor IDs', async () => {
    const user = userEvent.setup()
    render(<McpServers />)
    await screen.findByRole('button', { name: 'Edit cstar' })
    await user.click(screen.getByRole('button', { name: 'Add MCP server' }))
    await user.type(screen.getByLabelText(/Server name/), 'directory')
    await user.type(screen.getByLabelText(/Server URL/), 'https://directory.example/mcp')
    await user.type(
      screen.getByLabelText(/Credential environment variable/),
      'DIRECTORY_MCP_API_KEY',
    )
    await user.click(screen.getByRole('button', { name: 'Add tool' }))
    await user.type(screen.getByLabelText(/Tool name/), 'get_recipients')
    await user.type(
      screen.getByLabelText('Permitted parameters (comma separated)'),
      'groupIds, query, ',
    )
    await user.click(screen.getByLabelText('Tool enabled'))
    await user.click(screen.getByRole('button', { name: 'Save server' }))
    await waitFor(() =>
      expect(saveMcpServer).toHaveBeenCalledWith({
        name: 'directory',
        url: 'https://directory.example/mcp',
        protocol: 'streamable-http',
        credentialEnv: 'DIRECTORY_MCP_API_KEY',
        enabled: true,
        tools: [
          { name: 'get_recipients', enabled: false, permittedParameters: ['groupIds', 'query'] },
        ],
      }),
    )
  })

  it('preserves the other tool and its parameters when one is removed', async () => {
    const user = userEvent.setup()
    render(<McpServers />)
    await user.click(await screen.findByRole('button', { name: 'Edit cstar' }))
    const nameField = screen.getByLabelText(/Tool name/)
    await user.clear(nameField)
    await user.type(nameField, 'get_members')
    expect(screen.getByLabelText(/Tool name/)).toBe(nameField)
    await user.clear(screen.getByLabelText(/Server URL/))
    await user.type(screen.getByLabelText(/Server URL/), 'https://directory.example/mcp')
    await user.clear(screen.getByLabelText(/Credential environment variable/))
    await user.type(
      screen.getByLabelText(/Credential environment variable/),
      'DIRECTORY_MCP_API_KEY',
    )
    await user.click(screen.getByRole('button', { name: 'Add tool' }))
    const added = screen.getByRole('group', { name: 'Tool 2' })
    await user.type(within(added).getByLabelText(/Tool name/), 'list_groups')
    await user.type(within(added).getByLabelText('Permitted parameters (comma separated)'), 'query')
    await user.click(
      within(screen.getByRole('group', { name: 'Tool 1' })).getByRole('button', {
        name: 'Remove tool',
      }),
    )
    expect(screen.getByLabelText(/Tool name/)).toHaveValue('list_groups')
    expect(screen.getByLabelText('Permitted parameters (comma separated)')).toHaveValue('query')
    await user.click(screen.getByRole('button', { name: 'Save server' }))
    await waitFor(() =>
      expect(saveMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [{ name: 'list_groups', enabled: true, permittedParameters: ['query'] }],
        }),
      ),
    )
  })

  it('cancels editing without saving', async () => {
    render(<McpServers />)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit cstar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText(/Server name/)).not.toBeInTheDocument()
    expect(saveMcpServer).not.toHaveBeenCalled()
  })

  it.each([
    [
      { response: { data: { message: ['URL invalid', 'Credential invalid'] } } },
      'URL invalid; Credential invalid',
    ],
    [{ response: { data: { message: 'Not permitted' } } }, 'Not permitted'],
    [new Error('Connection failed'), 'Connection failed'],
    [{}, 'Request failed'],
  ])('reports load failures without exposing an empty success state', async (error, expected) => {
    vi.mocked(listMcpServers).mockRejectedValueOnce(error)
    render(<McpServers />)
    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
  })

  it('keeps edits available after a rejected save', async () => {
    vi.mocked(saveMcpServer).mockRejectedValueOnce(new Error('Save failed'))
    render(<McpServers />)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit cstar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save server' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByRole('button', { name: 'Save server' })).toBeEnabled()
    expect(screen.getByLabelText(/Server name/)).toBeInTheDocument()
  })
})
