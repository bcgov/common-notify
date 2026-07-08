import { BadGatewayException, Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpTransport } from '../mcp-servers/entities/mcp-server.entity';

const CALL_TIMEOUT_MS = 15_000;

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface ToolCallResult {
  content: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number, action: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms while ${action}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function buildTransport(url: string, transport: McpTransport, apiKey: string): Transport {
  const requestInit = { headers: { Authorization: `Bearer ${apiKey}` } };
  return transport === 'sse'
    ? new SSEClientTransport(new URL(url), { requestInit })
    : new StreamableHTTPClientTransport(new URL(url), { requestInit });
}

/**
 * Connects to an arbitrary registered MCP server, runs one action, and always closes the
 * connection. Fresh client/transport per call is intentional for this low-traffic internal tool
 * — no session pooling.
 */
@Injectable()
export class McpClientFactory {
  async withClient<T>(
    url: string,
    transport: McpTransport,
    apiKey: string,
    action: (client: Client) => Promise<T>,
  ): Promise<T> {
    const clientTransport = buildTransport(url, transport, apiKey);
    const client = new Client({ name: 'mcp-console', version: '1.0.0' }, { capabilities: {} });
    try {
      await withTimeout(client.connect(clientTransport), CALL_TIMEOUT_MS, `connecting to ${url}`);
      return await withTimeout(action(client), CALL_TIMEOUT_MS, `calling ${url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`Could not reach MCP server at ${url}: ${message}`);
    } finally {
      await clientTransport.close().catch(() => undefined);
    }
  }

  async listTools(url: string, transport: McpTransport, apiKey: string): Promise<ToolInfo[]> {
    return this.withClient(url, transport, apiKey, async (client) => {
      const { tools } = await client.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    });
  }

  async callTool(
    url: string,
    transport: McpTransport,
    apiKey: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    return this.withClient(url, transport, apiKey, async (client) => {
      const result = await client.callTool({ name: toolName, arguments: args });
      return {
        content: result.content,
        structuredContent: result.structuredContent,
        isError: Boolean(result.isError),
      };
    });
  }
}
