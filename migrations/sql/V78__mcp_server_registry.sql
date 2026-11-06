-- Operator-managed registry, ready for a future super-admin management screen.
-- Secrets stay in the runtime secret store; credential_env is only an env-var NAME.
CREATE TABLE notify.mcp_server (
  name VARCHAR(100) PRIMARY KEY,
  url TEXT NOT NULL CHECK (url ~ '^https?://'),
  protocol VARCHAR(32) NOT NULL CHECK (protocol = 'streamable-http'),
  credential_env VARCHAR(128) NOT NULL CHECK (credential_env ~ '^[A-Z][A-Z0-9_]*$'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE notify.mcp_tool (
  server_name VARCHAR(100) NOT NULL REFERENCES notify.mcp_server(name),
  name VARCHAR(100) NOT NULL,
  permitted_parameters JSONB NOT NULL CHECK (jsonb_typeof(permitted_parameters) = 'array'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (server_name, name)
);
COMMENT ON TABLE notify.mcp_server IS 'Trusted outbound MCP destinations. Editing grants outbound network access; restrict to super admins/operators.';
COMMENT ON COLUMN notify.mcp_server.credential_env IS 'Environment variable containing the bearer credential. Never store the secret itself here.';
COMMENT ON COLUMN notify.mcp_tool.permitted_parameters IS 'Allowlisted tool argument names. Tenant context is always supplied separately by Notify.';
-- Disabled until the adapter image and secrets have been provisioned.
INSERT INTO notify.mcp_server VALUES ('cstar', 'http://cstar-mcp:3101/mcp', 'streamable-http', 'CSTAR_MCP_API_KEY', FALSE);
INSERT INTO notify.mcp_tool VALUES
  ('cstar', 'list_groups', '[]', TRUE),
  ('cstar', 'get_recipients', '["groupIds"]', TRUE);
