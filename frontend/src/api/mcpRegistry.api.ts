import { get, post, generateApiParameters } from '@/common/api'

export interface McpTool {
  name: string
  enabled: boolean
  permittedParameters: string[]
}
export interface McpServer {
  name: string
  url: string
  protocol: 'streamable-http'
  credentialEnv: string
  enabled: boolean
  tools: McpTool[]
}

const base = '/api/v1/frontend/admin/mcp-servers'
export const listMcpServers = () => get<McpServer[]>(generateApiParameters(base))
export const saveMcpServer = ({ name, ...input }: McpServer) =>
  post({ ...generateApiParameters(`${base}/${encodeURIComponent(name)}`), data: input })

export const previewGroupRecipients = (groupIds: string[]) =>
  post<{ emails: string[] }>({
    ...generateApiParameters('/api/v1/frontend/events/cstar-group-recipients'),
    data: { groupIds },
  })
