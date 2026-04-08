-- Add oauth2_client_id column to tenants table for OAuth2-based multi-tenant identification
-- This allows tenants to be identified by their OAuth2 client ID when using token-based authentication
ALTER TABLE tenants
ADD COLUMN oauth2_client_id VARCHAR(255) UNIQUE NULL;

-- Create index on oauth2_client_id for faster lookups during OAuth2 token validation
CREATE INDEX idx_tenants_oauth2_client_id ON tenants (oauth2_client_id);

-- Add comment explaining the purpose of this column
COMMENT ON COLUMN tenants.oauth2_client_id IS 'OAuth2 client ID for token-based authentication (e.g., client credentials flow)';
