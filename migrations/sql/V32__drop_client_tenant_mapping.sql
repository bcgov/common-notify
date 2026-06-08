-- V33: Drop client_tenant_mapping table
-- Purpose: Remove the client credential-based mapping system in favor of API key-based access control
--
-- Migration notes:
-- - This table is no longer needed as we're moving from client credentials to API keys
-- - API keys are stored in the api_key table and linked directly to tenants
-- - Service-to-service calls now use API keys with tenant association
DROP TABLE IF EXISTS notify.client_tenant_mapping CASCADE;

-- Drop the index as well if it wasn't auto-dropped with CASCADE
DROP INDEX IF EXISTS idx_client_tenant_mapping_client_id;

DROP INDEX IF EXISTS idx_client_tenant_mapping_tenant_id;

DROP INDEX IF EXISTS idx_client_tenant_mapping_active;
