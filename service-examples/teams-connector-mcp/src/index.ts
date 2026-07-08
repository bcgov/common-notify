import { FastMCP } from "fastmcp";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration & initialisation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable "${name}" is not set`);
  return value;
}

const DEFAULT_CONNECTOR_URL = "https://relay.developer.gov.bc.ca";

const BASE_URL = (process.env.TEAMS_CONNECTOR_URL || DEFAULT_CONNECTOR_URL).replace(/\/$/, "");
const API_KEY = requireEnv("CONNECTOR_API_KEY");

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return json;
}

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Common fields shared by every send_*_message tool
// ---------------------------------------------------------------------------

const TargetFields = {
  teamId: z.string().uuid().describe("UUID of the Microsoft Teams team"),
  channelId: z.string().min(1).describe("Teams channel ID, e.g. '19:abc123@thread.tacv2'"),
};

const CommonOptionalFields = {
  mentions: z
    .array(
      z.object({
        id: z.string().min(1).max(512).describe("Entra object ID or email address"),
        name: z.string().min(1).max(256).describe("Display name of the user to mention"),
      })
    )
    .max(10)
    .optional()
    .describe("Up to 10 users to @mention in the message"),

  metadata: z
    .record(z.string().max(256))
    .optional()
    .describe("Optional key-value metadata (max 20 keys, key length ≤ 64 chars, value length ≤ 256 chars)"),

  preview: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "When true, validates and renders the payload without delivering to Teams " +
        "(calls /api/v1/messages/preview instead of /api/v1/messages)"
    ),
};

type CommonArgs = {
  teamId: string;
  channelId: string;
  mentions?: Array<{ id: string; name: string }>;
  metadata?: Record<string, string>;
  preview?: boolean;
};

async function sendContent(args: CommonArgs, content: unknown): Promise<string> {
  const body: Record<string, unknown> = {
    target: { teamId: args.teamId, channelId: args.channelId },
    content,
  };

  if (args.mentions && args.mentions.length > 0) {
    body.mentions = args.mentions;
  }
  if (args.metadata && Object.keys(args.metadata).length > 0) {
    body.metadata = args.metadata;
  }

  const path = args.preview ? "/api/v1/messages/preview" : "/api/v1/messages";
  const result = await post(path, body);
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// Zod schemas for template data (matches devx-teams-connector types.ts)
// ---------------------------------------------------------------------------

const GenericDataSchema = z.object({
  title: z.string().describe("Notification title"),
  body: z.string().optional().describe("Notification body text"),
  severity: z.string().optional().describe("Severity level, e.g. 'critical', 'warning', 'info'"),
  url: z.string().url().optional().describe("Link URL"),
  urlLabel: z.string().optional().describe("Label for the link"),
  source: z.string().optional().describe("Source system name"),
});

const GitHubPrDataSchema = z.object({
  event: z.string().describe("PR event type, e.g. 'opened', 'merged', 'closed'"),
  title: z.string().describe("Pull request title"),
  repo: z.string().describe("Repository full name, e.g. 'org/repo'"),
  author: z.string().describe("PR author username"),
  url: z.string().url().describe("URL to the pull request"),
  body: z.string().optional().describe("PR description or comment body"),
});

const GitHubWorkflowDataSchema = z.object({
  event: z.string().describe("Workflow event type, e.g. 'workflow_run'"),
  conclusion: z.string().optional().describe("Workflow run conclusion, e.g. 'success', 'failure'"),
  workflow: z.string().describe("Workflow name"),
  repo: z.string().describe("Repository full name, e.g. 'org/repo'"),
  branch: z.string().describe("Branch that triggered the workflow"),
  author: z.string().describe("Actor who triggered the run"),
  url: z.string().url().describe("URL to the workflow run"),
  sha: z.string().optional().describe("Commit SHA"),
  message: z.string().optional().describe("Commit message"),
});

const SysdigDataSchema = z.object({
  severity: z.number().int().describe("Alert severity number"),
  alertName: z.string().describe("Name of the Sysdig alert"),
  state: z.string().optional().describe("Alert state, e.g. 'ACTIVE', 'RESOLVED'"),
  scope: z.string().optional().describe("Scope expression"),
  description: z.string().optional().describe("Alert description"),
  timestamp: z.string().optional().describe("ISO 8601 timestamp"),
  url: z.string().url().optional().describe("Link to the alert in Sysdig"),
});

const UptimeDataSchema = z.object({
  status: z.enum(["up", "down"]).describe("Current service status"),
  service: z.string().describe("Service name or URL"),
  downSince: z.string().optional().describe("ISO 8601 timestamp when the service went down"),
  url: z.string().url().optional().describe("Link to the uptime dashboard"),
});

const DbBackupDataSchema = z.object({
  status: z.string().describe("Backup status, e.g. 'success', 'failure'"),
  projectName: z.string().describe("OpenShift/project short name"),
  projectFriendlyName: z.string().describe("Human-readable project name"),
  message: z.string().optional().describe("Additional status message"),
});

const ArgoCdDataSchema = z.object({
  event: z.string().describe("ArgoCD event type, e.g. 'app.sync.succeeded'"),
  application: z.string().describe("ArgoCD application name"),
  syncStatus: z.string().optional().describe("Sync status, e.g. 'Synced', 'OutOfSync'"),
  healthStatus: z.string().optional().describe("Health status, e.g. 'Healthy', 'Degraded'"),
  revision: z.string().optional().describe("Git revision/commit SHA"),
  project: z.string().optional().describe("ArgoCD project name"),
  target: z.string().optional().describe("Sync target revision or branch"),
  timestamp: z.string().optional().describe("ISO 8601 event timestamp"),
  message: z.string().optional().describe("Additional event message"),
  url: z.string().url().optional().describe("Link to the application in ArgoCD"),
});

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const mcp = new FastMCP({
  name: "teams-connector",
  version: "1.0.0",
  instructions: `MCP server for the devx-teams-connector service.
Sends notifications to Microsoft Teams channels via a Bot Framework relay.

Environment variables (set before starting this server):
  CONNECTOR_API_KEY     - Required. Bearer token matching CONNECTOR_API_KEY on the connector service.
  TEAMS_CONNECTOR_URL   - Optional. Base URL of the devx-teams-connector instance.
                          Defaults to ${DEFAULT_CONNECTOR_URL}.`,
});

// ---------------------------------------------------------------------------
// Tool: health
// ---------------------------------------------------------------------------

mcp.addTool({
  name: "health",
  description:
    "Check the health of the devx-teams-connector service. No authentication required. " +
    "Returns HTTP 200 with status information when the service is healthy.",
  parameters: z.object({}),
  execute: async () => {
    const result = await get("/health");
    return JSON.stringify(result, null, 2);
  },
});

// ---------------------------------------------------------------------------
// Tools: send_text_message / send_html_message
// ---------------------------------------------------------------------------

function addPlainTextTool(name: string, kind: "text" | "html", label: string) {
  mcp.addTool({
    name,
    description: `Post a ${label} message to a Microsoft Teams channel via the devx-teams-connector service.`,
    parameters: z.object({
      ...TargetFields,
      text: z.string().min(1).max(10000).describe("Message text"),
      ...CommonOptionalFields,
    }),
    execute: async (args) => sendContent(args, { kind, text: args.text }),
  });
}

addPlainTextTool("send_text_message", "text", "plain text");
addPlainTextTool("send_html_message", "html", "HTML-formatted");

// ---------------------------------------------------------------------------
// Tool: send_card_message (raw Adaptive Card passthrough)
// ---------------------------------------------------------------------------

mcp.addTool({
  name: "send_card_message",
  description:
    "Post a raw Microsoft Adaptive Card to a Teams channel via the devx-teams-connector service. " +
    "Must be enabled on the connector via ALLOW_CARD_PASSTHROUGH=true.",
  parameters: z.object({
    ...TargetFields,
    cardJson: z.string().describe("JSON string of a Microsoft Adaptive Card object"),
    ...CommonOptionalFields,
  }),
  execute: async (args) => {
    let card: unknown;
    try {
      card = JSON.parse(args.cardJson);
    } catch {
      throw new Error("'cardJson' must be a valid JSON string");
    }
    return sendContent(args, { kind: "card", card });
  },
});

// ---------------------------------------------------------------------------
// Tools: send_<template>_message
// ---------------------------------------------------------------------------

function addTemplateTool(
  name: string,
  templateName: string,
  description: string,
  dataSchema: z.ZodObject<z.ZodRawShape>
) {
  mcp.addTool({
    name,
    description,
    parameters: z.object({
      ...TargetFields,
      ...dataSchema.shape,
      ...CommonOptionalFields,
    }),
    execute: async (args) => {
      const data = dataSchema.parse(args);
      return sendContent(args, { kind: "template", template: templateName, data });
    },
  });
}

addTemplateTool(
  "send_generic_message",
  "generic",
  "Post a generic notification card (title, body, severity, link) to a Microsoft Teams channel.",
  GenericDataSchema
);

addTemplateTool(
  "send_github_pull_request_message",
  "github_pull_request",
  "Post a GitHub pull request notification card to a Microsoft Teams channel.",
  GitHubPrDataSchema
);

addTemplateTool(
  "send_github_workflow_run_message",
  "github_workflow_run",
  "Post a GitHub Actions workflow run notification card to a Microsoft Teams channel.",
  GitHubWorkflowDataSchema
);

addTemplateTool(
  "send_sysdig_message",
  "sysdig",
  "Post a Sysdig alert notification card to a Microsoft Teams channel.",
  SysdigDataSchema
);

addTemplateTool(
  "send_uptime_message",
  "uptime",
  "Post a service uptime/downtime notification card to a Microsoft Teams channel.",
  UptimeDataSchema
);

addTemplateTool(
  "send_db_backup_message",
  "db_backup",
  "Post a database backup status notification card to a Microsoft Teams channel.",
  DbBackupDataSchema
);

addTemplateTool(
  "send_argocd_message",
  "argocd",
  "Post an ArgoCD sync/health event notification card to a Microsoft Teams channel.",
  ArgoCdDataSchema
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

mcp.start({ transportType: "stdio" });
