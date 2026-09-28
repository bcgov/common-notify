-- V48: Configuration that turns the V47 recipient safelist on.
--
--   1. configuration 'safelist_max_entries' - global cap on entries per tenant.
--   2. tenant_settings.safelist_max_entries - optional per-tenant override of that cap.
--   3. notification_status_code 'blocked'   - status for recipients rejected by the safelist.
--   4. feature flag 'recipient_safelist'    - the enforcement switch.
--
-- There is deliberately no per-tenant "safelist enabled" flag. The safelist is an environment
-- guardrail, not a tenant preference: it is on for every tenant in the environments where the
-- 'recipient_safelist' flag is enabled (PR, DEV, TEST) and off everywhere else. Each
-- environment has its own database, so PROD simply leaves the flag at its seeded value of
-- FALSE and never enforces.
--
-- The flag is seeded FALSE here so that applying this migration changes no behaviour anywhere.
-- Enabling it in a non-production environment is a deliberate act (admin UI or SQL) and takes
-- effect immediately: from that point every tenant in that environment can only send to
-- recipients on its own safelist.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1 & 2. Entry cap: global default with an optional per-tenant override
-- ---------------------------------------------------------------------------
INSERT INTO
  notify.configuration (key, config, created_by, updated_by)
VALUES
  (
    'safelist_max_entries',
    '{"value": 50, "type": "number", "description": "Default maximum number of recipient safelist entries per tenant. Overridden per tenant by tenant_settings.safelist_max_entries"}'::JSONB,
    'system',
    'system'
  ) ON CONFLICT (key) DO NOTHING;

ALTER TABLE notify.tenant_settings
ADD COLUMN IF NOT EXISTS safelist_max_entries INTEGER;

ALTER TABLE notify.tenant_settings
ADD CONSTRAINT chk_tenant_settings_safelist_max CHECK (
  safelist_max_entries IS NULL
  OR safelist_max_entries > 0
);

COMMENT ON COLUMN notify.tenant_settings.safelist_max_entries IS 'Optional per-tenant override of the maximum number of recipient safelist entries. NULL means use the global notify.configuration key ''safelist_max_entries''.';

-- ---------------------------------------------------------------------------
-- 3. Notification status for safelist rejections
-- ---------------------------------------------------------------------------
-- Used on notification_request_detail rows when part of a mail-merge send is addressed to
-- recipients that are not safelisted. Requests where every recipient is blocked are rejected
-- with a 400 before any row is persisted, so they never reach this status.
INSERT INTO
  notify.notification_status_code (
    code,
    description,
    display_name,
    sort_order,
    created_by,
    updated_by
  )
VALUES
  (
    'blocked',
    'Recipient was not on the tenant safelist, so the notification was not sent',
    'Blocked',
    110,
    'system',
    'system'
  ) ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Feature flag (the enforcement switch)
-- ---------------------------------------------------------------------------
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
    'recipient_safelist',
    'Recipient Safelist',
    'Non-production guardrail. When enabled, every tenant in this environment can only send notifications to recipients on its own safelist; all other recipients are rejected. Enable in PR, DEV and TEST. Leave disabled in PROD.',
    30,
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'recipient_safelist',
    FALSE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
