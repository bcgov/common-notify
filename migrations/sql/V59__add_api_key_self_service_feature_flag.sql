-- ============================================================================
-- API Key Self-Service Feature Flag
--
-- Gates the "Generate API key" surface on the Settings screen, and the frontend
-- endpoints behind it.
--
-- This is an environment switch, not a per-tenant feature. Issuing a key calls the
-- APS Credential Issuer API, which exists only on the APS *test* instance — on the
-- production instance the same call returns 404. PR, DEV and TEST therefore point at
-- the test instance and can issue keys; PROD points at the production gateway and
-- cannot, so tenants there still onboard by requesting a key in the API Services
-- Portal and binding it manually.
--
-- Seeded OFF so a deployment can never expose a surface that would fail. Enable it in
-- PR, DEV and TEST from the Feature Flags admin screen once the APS_* variables for
-- that environment point at the test instance. Leave it disabled in PROD.
--
-- ============================================================================
BEGIN;

INSERT INTO
  notify.feature_flag_code (
    code,
    display_name,
    description,
    sort_order,
    created_by,
    updated_by
  )
VALUES
  (
    'api_key_self_service',
    'API Key Self-Service',
    'When enabled, tenant administrators can generate and regenerate their own API key from the Settings screen. Requires the environment to point at an API gateway that offers the Credential Issuer API. Enable in PR, DEV and TEST. Leave disabled in PROD.',
    40,
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'api_key_self_service',
    FALSE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
