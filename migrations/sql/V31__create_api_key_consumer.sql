-- V31: Create api_key_consumer table
-- Maps a Kong API key credential identifier to a Notify tenant.
-- The credential_identifier comes from the x-credential-identifier header forwarded
-- by Kong's key-auth plugin (the key's ID, never the raw key value).
-- This allows the backend to resolve which tenant an API key belongs to without
-- requiring access to Kong's Admin API.
CREATE TABLE
  api_key_consumer (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    credential_identifier VARCHAR(512) NOT NULL,
    consumer_id VARCHAR(255),
    tenant_id UUID NOT NULL,
    bound_by_idir_guid VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now (),
    updated_at TIMESTAMP NOT NULL DEFAULT now (),
    CONSTRAINT pk_api_key_consumer PRIMARY KEY (id),
    CONSTRAINT uq_api_key_consumer_credential UNIQUE (credential_identifier),
    CONSTRAINT fk_api_key_consumer_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
  );

CREATE INDEX idx_api_key_consumer_tenant_id ON api_key_consumer (tenant_id);
