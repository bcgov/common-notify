import axios from 'axios';
import type { ServiceCategory } from '@/constants/categories';

const client = axios.create({ baseURL: '/api' });

export type McpTransport = 'streamable-http' | 'sse';

export interface McpServerSummary {
  id: string;
  shortName: string;
  url: string;
  transport: McpTransport;
  category: ServiceCategory;
  enabledTools: string[];
  createdAt: string;
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface JsonSchema {
  type?: string;
  format?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  title?: string;
}

export interface ToolCallResult {
  content: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}

export const listServers = () => client.get<McpServerSummary[]>('/mcp-servers').then((r) => r.data);

export const getServer = (id: string) =>
  client.get<McpServerSummary>(`/mcp-servers/${id}`).then((r) => r.data);

export const createServer = (payload: {
  shortName: string;
  url: string;
  transport: McpTransport;
  category: ServiceCategory;
  apiKey: string;
  enabledTools: string[];
}) => client.post<McpServerSummary>('/mcp-servers', payload).then((r) => r.data);

export const discoverTools = (payload: { url: string; transport: McpTransport; apiKey: string }) =>
  client.post<ToolInfo[]>('/mcp-client/discover', payload).then((r) => r.data);

export const listServerTools = (id: string) =>
  client.get<ToolInfo[]>(`/mcp-client/${id}/tools`).then((r) => r.data);

/** All tools discovered from the live server, unfiltered by enabledTools — for editing the enabled set. */
export const listAllServerTools = (id: string) =>
  client.get<ToolInfo[]>(`/mcp-client/${id}/all-tools`).then((r) => r.data);

export const updateEnabledTools = (id: string, enabledTools: string[]) =>
  client
    .patch<McpServerSummary>(`/mcp-servers/${id}/enabled-tools`, { enabledTools })
    .then((r) => r.data);

export const executeTool = (id: string, toolName: string, args: Record<string, unknown>) =>
  client
    .post<ToolCallResult>(`/mcp-client/${id}/execute`, { toolName, arguments: args })
    .then((r) => r.data);

export interface ToolDefaults {
  global: Record<string, unknown>;
  tenant: Record<string, unknown>;
}

export const getToolDefaults = (serverId: string, toolName: string, tenant?: string) =>
  client
    .get<ToolDefaults>(`/mcp-servers/${serverId}/tools/${toolName}/defaults`, {
      params: tenant ? { tenant } : undefined,
    })
    .then((r) => r.data);

export const saveToolDefaults = (
  serverId: string,
  toolName: string,
  payload: { scope: 'global' | 'tenant'; tenantName?: string; values: Record<string, unknown> },
) =>
  client
    .post<ToolDefaults>(`/mcp-servers/${serverId}/tools/${toolName}/defaults`, payload)
    .then((r) => r.data);

export interface TenantServiceSummary extends McpServerSummary {
  defaultToolName: string | null;
}

export const listTenantServices = (tenant: string) =>
  client
    .get<TenantServiceSummary[]>('/tenant-services', { params: { tenant } })
    .then((r) => r.data);

export const addTenantService = (tenantName: string, serverId: string) =>
  client.post<void>('/tenant-services', { tenantName, serverId }).then((r) => r.data);

export const setDefaultTool = (tenantName: string, serverId: string, toolName: string) =>
  client
    .post<void>('/tenant-services/default-tool', { tenantName, serverId, toolName })
    .then((r) => r.data);
