-- Create API Key table for managing Kong API keys per tenant
-- Stores metadata about API keys (Kong manages the actual key values)
CREATE TABLE
  notify.api_key (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL REFERENCES notify.tenant (id),
    kong_consumer_id VARCHAR(255) NOT NULL,
    kong_key_id VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(255),
    rate_limit_config JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

-- Create indexes for common queries
CREATE INDEX idx_api_key_tenant_id ON notify.api_key (tenant_id);

CREATE INDEX idx_api_key_kong_key_id ON notify.api_key (kong_key_id);

CREATE INDEX idx_api_key_tenant_active ON notify.api_key (tenant_id, revoked_at)
WHERE
  revoked_at IS NULL;

-- Add comment for documentation
COMMENT ON TABLE notify.api_key IS 'Stores metadata about API keys generated for tenants. Actual key values are managed by Kong.';

COMMENT ON COLUMN notify.api_key.kong_consumer_id IS 'Reference to the Kong consumer (created per tenant)';

COMMENT ON COLUMN notify.api_key.kong_key_id IS 'Unique identifier of the key in Kong';

COMMENT ON COLUMN notify.api_key.display_name IS 'User-friendly name for the API key';

COMMENT ON COLUMN notify.api_key.usage_count IS 'Number of times this key has been used for authentication';

COMMENT ON COLUMN notify.api_key.rate_limit_config IS 'JSON configuration for per-key rate limiting (flexible for future use)';
