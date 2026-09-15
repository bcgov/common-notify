-- ============================================================================
-- Remove the API Key Self-Service Feature Flag
--
-- The flag existed because issuing a key calls the APS Credential Issuer API, which
-- was only available on the APS test instance. PROD could not issue, so the Settings
-- surface and the frontend endpoints behind it were hidden there.
--
-- The Credential Issuer API is now available on the production APS instance, and every
-- environment issues through the gw-fe8c5 gateway. There is nothing left to gate, so
-- the flag and any per-tenant overrides of it are removed.
--
-- Order matters: feature_flag.code is a foreign key to feature_flag_code.code, so the
-- instances go first.
-- ============================================================================
BEGIN;

DELETE FROM notify.feature_flag
WHERE
  code = 'api_key_self_service';

DELETE FROM notify.feature_flag_code
WHERE
  code = 'api_key_self_service';

COMMIT;
