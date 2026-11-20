-- ============================================================================
-- Dismissing tenant requests
--
-- A tenant can clear a finished request (rejected, cancelled or released) from
-- its own settings, so the page goes back to offering a fresh request. It is
-- the tenant's view only: the request keeps its status, and admins still see
-- it on the tenant requests page.
-- ============================================================================
BEGIN;

ALTER TABLE notify.tenant_request
  ADD COLUMN IF NOT EXISTS dismissed_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS dismissed_by_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN notify.tenant_request.dismissed_by IS 'Stable identifier of the tenant user who cleared the finished request from the tenant''s settings. NULL unless dismissed. Does not change the status.';
COMMENT ON COLUMN notify.tenant_request.dismissed_by_name IS 'Display name of that user at the time. NULL if the token carried none.';
COMMENT ON COLUMN notify.tenant_request.dismissed_at IS 'When the tenant cleared the request from its settings. The tenant''s settings no longer show a dismissed request; admins still do.';

COMMIT;
