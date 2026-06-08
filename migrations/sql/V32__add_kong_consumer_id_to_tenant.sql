-- V32: Add Kong consumer ID to tenant table
-- Purpose: Store Kong's consumer UUID for managing API keys per tenant
ALTER TABLE notify.tenant
ADD COLUMN kong_consumer_id VARCHAR(36) NULL;

-- Add index for faster lookups by Kong consumer ID
CREATE INDEX idx_tenant_kong_consumer_id ON notify.tenant (kong_consumer_id);

-- Add comment explaining the column
COMMENT ON COLUMN notify.tenant.kong_consumer_id IS 'Kong consumer UUID - stores the Kong-assigned consumer ID for API key management. Set when the tenant is created and a consumer is created in Kong.';
