-- V54: Self-service API key issuing via the APS Credential Issuer API.
--
-- Until now a tenant got a key by requesting one in the API Services Portal and then
-- calling POST /api/v1/service/api-key/bind with that key, which is where
-- credential_identifier came from. Notify can now issue the credential itself, and
-- the issue response carries the gateway clientId but NOT Kong's per-credential ID.
--
-- So credential_identifier becomes nullable and client_id becomes the identifier we
-- know at issue time. On the first gateway-authenticated request the backend matches
-- the consumer username to client_id and backfills credential_identifier, after which
-- lookups take the original fast path.
ALTER TABLE api_key_consumer
  ALTER COLUMN credential_identifier DROP NOT NULL;

ALTER TABLE api_key_consumer
  -- Gateway consumer id, formatted {environmentAppId}-{applicationAppId}. Shown in the
  -- Notify UI as the API key label.
  ADD COLUMN client_id VARCHAR(255),
  -- Application half of client_id, kept split out so an Application can be reused
  -- across environments without re-parsing client_id.
  ADD COLUMN application_app_id VARCHAR(255),
  -- Free-text note the tenant records against the key, typically where they stored it.
  ADD COLUMN notes VARCHAR(500),
  -- 'bind' for keys bound through the legacy Portal flow, 'self-service' for keys
  -- Notify issued. Existing rows all predate self-service.
  ADD COLUMN issued_via VARCHAR(20) NOT NULL DEFAULT 'bind',
  ADD COLUMN issued_at TIMESTAMP,
  ADD COLUMN last_regenerated_at TIMESTAMP;

-- No revocation columns: revoking a key happens on the API Services Portal Consumers
-- page, which is where the gateway actually stops honouring it. A key revoked there
-- never reaches Notify again, so its row is inert rather than something to flag.

ALTER TABLE api_key_consumer
  ADD CONSTRAINT uq_api_key_consumer_client_id UNIQUE (client_id);

-- Lookup path for requests whose credential_identifier has not been backfilled yet.
CREATE INDEX idx_api_key_consumer_client_id ON api_key_consumer (client_id)
WHERE
  client_id IS NOT NULL;

-- A row must be resolvable by at least one of the two identifiers, otherwise it can
-- never authenticate a request and is just orphaned state.
ALTER TABLE api_key_consumer
  ADD CONSTRAINT ck_api_key_consumer_identifier CHECK (
    credential_identifier IS NOT NULL
    OR client_id IS NOT NULL
  );

COMMENT ON COLUMN api_key_consumer.credential_identifier IS 'Kong per-key credential ID from the x-credential-identifier header. NULL until the first authenticated request for self-issued keys.';

COMMENT ON COLUMN api_key_consumer.client_id IS 'Gateway consumer clientId, {environmentAppId}-{applicationAppId}. Matched against the consumer username Kong forwards.';
