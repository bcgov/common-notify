-- Create tenants table for multi-tenant management
CREATE TABLE
  IF NOT EXISTS notify.tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    organization VARCHAR(255),
    contact_email VARCHAR(255),
    contact_name VARCHAR(255),
    kong_consumer_id VARCHAR(255) UNIQUE,
    kong_username VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

-- Create index on kong_username for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenants_kong_username ON notify.tenants (kong_username);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_tenants_status ON notify.tenants (status);
