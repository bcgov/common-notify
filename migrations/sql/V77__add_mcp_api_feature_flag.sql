-- ============================================================================
-- MCP API Feature Flag
--
-- Controls access to the MCP server endpoint. Seeded OFF globally so endpoint
-- access can be enabled deliberately when the MCP server is ready.
-- ============================================================================
BEGIN;

INSERT INTO
  notify.feature_flag_code (
    code,
    display_name,
    description,
    sort_order,
    created_by,
    updated_by
  )
VALUES
  (
    'mcp_api',
    'MCP API',
    'When enabled, the tenant may access the MCP server endpoint. When disabled, access to the MCP server endpoint is denied.',
    70,
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'mcp_api',
    FALSE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
