-- Enable the built-in CSTAR connection as part of deployment, without a manual
-- registry activation step. Applies to both new and existing databases.
UPDATE notify.mcp_server
SET enabled = TRUE
WHERE name = 'cstar';
