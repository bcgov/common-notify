import { useEffect, useState } from 'react'
import { Button, TextField } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import NotAuthorized from '@/components/NotAuthorized'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'
import { listMcpServers, saveMcpServer } from '@/api/mcpRegistry.api'
import type { McpServer } from '@/api/mcpRegistry.api'
import { showSuccessToast } from '@/redux/utils/toastUtils'
import '@/scss/pages/mcp-servers.scss'

const blank: McpServer = {
  name: '',
  url: '',
  protocol: 'streamable-http',
  credentialEnv: '',
  enabled: false,
  tools: [],
}
function message(error: unknown): string {
  const body = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message
  return Array.isArray(body)
    ? body.join('; ')
    : (body ?? (error instanceof Error ? error.message : 'Request failed'))
}

export default function McpServers() {
  const isAdmin = UserService.hasRole(SsoRole.NOTIFY_ADMIN)
  const [servers, setServers] = useState<McpServer[]>([])
  const [editing, setEditing] = useState<McpServer | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [parameterInputs, setParameterInputs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isAdmin) return
    let active = true
    listMcpServers()
      .then((rows) => {
        if (active) setServers(rows)
      })
      .catch((reason) => {
        if (active) setError(message(reason))
      })
    return () => {
      active = false
    }
  }, [isAdmin])
  if (!isAdmin) return <NotAuthorized />

  async function save() {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      await saveMcpServer({
        ...editing,
        tools: editing.tools.map((tool, index) => ({
          ...tool,
          permittedParameters: (parameterInputs[index] ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
        })),
      })
      setServers(await listMcpServers())
      setEditing(null)
      showSuccessToast('MCP server saved')
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page mcp-servers">
      <PageHeading title="MCP Servers" />
      <p>Manage the servers Notify uses to look up recipients. Changes apply to all tenants.</p>
      <p>
        Login, tenant selection and event permissions continue to use CSTAR. This registry controls
        group and email lookups.
      </p>
      {error && (
        <div role="alert" className="mcp-servers__error">
          {error}
        </div>
      )}
      <Button
        variant="primary"
        isDisabled={busy}
        onPress={() => {
          setEditing({ ...blank, tools: [] })
          setParameterInputs([])
          setIsNew(true)
          setError('')
        }}
      >
        Add MCP server
      </Button>
      <table className="mcp-servers__table">
        <caption>Registered MCP servers</caption>
        <thead>
          <tr>
            <th scope="col">Server</th>
            <th scope="col">Destination</th>
            <th scope="col">Status</th>
            <th scope="col">Tools</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((server) => (
            <tr key={server.name}>
              <th scope="row">{server.name}</th>
              <td>{server.url}</td>
              <td>{server.enabled ? 'Enabled' : 'Disabled'}</td>
              <td>
                {server.tools
                  .filter((tool) => tool.enabled)
                  .map((tool) => tool.name)
                  .join(', ') || 'No enabled tools'}
              </td>
              <td>
                <Button
                  isDisabled={busy}
                  aria-label={`Edit ${server.name}`}
                  onPress={() => {
                    setEditing(structuredClone(server))
                    setParameterInputs(
                      server.tools.map((tool) => tool.permittedParameters.join(', ')),
                    )
                    setIsNew(false)
                    setError('')
                  }}
                >
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <form
          className="mcp-servers__form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <h2>{isNew ? 'Add MCP server' : `Edit ${editing.name}`}</h2>
          <TextField
            label="Server name"
            value={editing.name}
            isRequired
            isDisabled={!isNew || busy}
            onChange={(name) => setEditing({ ...editing, name })}
          />
          <TextField
            label="Server URL"
            value={editing.url}
            isRequired
            isDisabled={busy}
            onChange={(url) => setEditing({ ...editing, url })}
          />
          <p>
            Transport: Streamable HTTP. External destinations require HTTPS and an approved
            hostname.
          </p>
          <TextField
            label="Credential environment variable"
            value={editing.credentialEnv}
            isRequired
            isDisabled={busy}
            onChange={(credentialEnv) => setEditing({ ...editing, credentialEnv })}
          />
          <p>
            Enter a reference such as CSTAR_MCP_API_KEY. Secret values are managed outside this
            screen.
          </p>
          <label>
            <input
              type="checkbox"
              checked={editing.enabled}
              disabled={busy}
              onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })}
            />{' '}
            Server enabled
          </label>
          <h3>Permitted tools</h3>
          {editing.tools.map((tool, index) => (
            <fieldset key={index}>
              <legend>Tool {index + 1}</legend>
              <TextField
                label="Tool name"
                value={tool.name}
                isRequired
                isDisabled={busy}
                onChange={(name) =>
                  setEditing({
                    ...editing,
                    tools: editing.tools.map((item, i) => (i === index ? { ...item, name } : item)),
                  })
                }
              />
              <TextField
                label="Permitted parameters (comma separated)"
                value={parameterInputs[index] ?? ''}
                isDisabled={busy}
                onChange={(value) =>
                  setParameterInputs(parameterInputs.map((item, i) => (i === index ? value : item)))
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={tool.enabled}
                  disabled={busy}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      tools: editing.tools.map((item, i) =>
                        i === index ? { ...item, enabled: event.target.checked } : item,
                      ),
                    })
                  }
                />{' '}
                Tool enabled
              </label>
              <Button
                isDisabled={busy}
                onPress={() => {
                  setEditing({ ...editing, tools: editing.tools.filter((_, i) => i !== index) })
                  setParameterInputs(parameterInputs.filter((_, i) => i !== index))
                }}
              >
                Remove tool
              </Button>
            </fieldset>
          ))}
          <div className="mcp-servers__actions">
            <Button
              isDisabled={busy}
              onPress={() => {
                setEditing({
                  ...editing,
                  tools: [...editing.tools, { name: '', enabled: true, permittedParameters: [] }],
                })
                setParameterInputs([...parameterInputs, ''])
              }}
            >
              Add tool
            </Button>
            <Button variant="primary" type="submit" isDisabled={busy}>
              {busy ? 'Saving…' : 'Save server'}
            </Button>
            <Button isDisabled={busy} onPress={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
