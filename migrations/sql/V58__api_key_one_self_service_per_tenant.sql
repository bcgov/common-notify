-- V55: enforce the one-self-issued-key-per-tenant limit in the database.
--
-- The service checks the count before issuing, but a check-then-write cannot hold under
-- concurrency: two requests (a double-click, a retry, two tabs) both read a count of
-- zero and both go on to create a key. Nothing downstream catches it — the clientIds
-- differ, so the existing unique constraint on client_id does not apply.
--
-- That matters more here than a duplicate row usually would. Every issued key is an
-- Application and a Consumer on a gateway shared across the ministry, the Credential
-- Issuer API has no delete operation, and the UI only ever surfaces one key per tenant —
-- so the extra one is invisible, permanent, and cleanable only by hand in the Portal.
--
-- Partial, so it constrains only what Notify manages: keys bound through the legacy
-- Postman flow (issued_via = 'bind') are unaffected, and a tenant may hold one of each
-- while migrating between them.
--
-- Raising MAX_KEYS_PER_TENANT above 1 means dropping this index — see the constant in
-- api-key-issuance.service.ts for what else that involves.
CREATE UNIQUE INDEX uq_api_key_consumer_one_self_service_per_tenant ON api_key_consumer (tenant_id)
WHERE
  issued_via = 'self-service';
