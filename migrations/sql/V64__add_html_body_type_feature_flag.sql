-- ============================================================================
-- HTML Body Type Feature Flag
--
-- Gates `bodyType: "html"` on the notify API. A markdown body is rendered by us
-- with markdown-it configured `html: false`, so a caller cannot inject markup and
-- personalisation values cannot carry tags. `html` skips that and puts the caller's
-- markup on the wire unchanged, so it becomes opt-in per tenant.
--
-- Seeded ON globally, which is deliberately the opposite of V59. Tenants are sending
-- `bodyType: "html"` today, and seeding this OFF would reject their next send the
-- moment the migration lands. This flag exists so those senders can be moved to
-- markdown one at a time rather than all at once.
--
-- The intended path, once the remaining senders are migrated:
--   1. Add a tenant override ON for any tenant still on HTML (Feature Flags admin screen).
--   2. Flip the global row OFF, so new tenants get markdown-only by default.
--   3. Remove the overrides as each tenant finishes migrating.
--
-- Tenant IDs differ per environment, so step 1 is an operator action rather than a
-- migration - there is no set of UUIDs that would be correct in DEV, TEST and PROD.
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
    'html_body_type',
    'HTML Body Type',
    'When enabled, the tenant may send `bodyType: "html"` and supply its own markup, which is delivered unchanged. When disabled, bodies must be markdown or plain text and are rendered by the service. Seeded ON to preserve existing senders; turn OFF globally once they have moved to markdown.',
    50,
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'html_body_type',
    TRUE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
