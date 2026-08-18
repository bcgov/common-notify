-- V52: Keep the application's audit values on recipient_safelist rows.
--
-- V49 attached notify.audit_history() to recipient_safelist. That function is a BEFORE trigger
-- that overwrites created_by/updated_by with `app.current_user` when the session defines it and
-- with the database role otherwise. The backend never sets app.current_user, so every safelist
-- row was attributed to the login the pod connects with ('app'), discarding the IDIR GUID the
-- API passes for the administrator who made the change - and making the 'Added by' column in
-- the UI useless.
--
-- Setting app.current_user per transaction was the other option and is deliberately not taken:
-- once that placeholder GUC is set on a pooled connection it reverts to an empty string rather
-- than to unset, so every later write on that connection - including writes to other tables -
-- would record an empty audit user.
--
-- Instead this replaces the trigger on recipient_safelist with an AFTER variant that records
-- history without touching the row. AFTER triggers cannot modify NEW, so the values the
-- application supplies are the values that persist, and history is attributed to the same user.
-- Other tables keep notify.audit_history() and are unaffected.
BEGIN;

CREATE OR REPLACE FUNCTION notify.audit_history_preserving_actor () RETURNS TRIGGER AS $$
DECLARE
  v_history_table TEXT;
  v_pk_column TEXT;
BEGIN
  v_history_table := TG_ARGV[0];
  v_pk_column := TG_ARGV[1];

  EXECUTE format(
    'INSERT INTO notify.%I (target_row_id, operation_type, operation_user,
     operation_executed_at, data_after_operation) VALUES ($1.%I, %L, $2, now(), to_jsonb($1))',
    v_history_table, v_pk_column, SUBSTRING(TG_OP, 1, 1)
  ) USING NEW, COALESCE(NEW.updated_by, NEW.created_by, current_user);

  -- AFTER trigger: the return value is ignored and the row is already written as supplied.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify.audit_history_preserving_actor () IS 'History trigger for tables whose created_by/updated_by are set by the application. Records a full row snapshot after INSERT/UPDATE without modifying the row, attributing the history entry to the row''s own audit user. Contrast notify.audit_history(), which overwrites those columns from app.current_user or the database role.';

DROP TRIGGER IF EXISTS recipient_safelist_audit ON notify.recipient_safelist;

CREATE TRIGGER recipient_safelist_audit
AFTER INSERT
OR
UPDATE ON notify.recipient_safelist FOR EACH ROW
EXECUTE FUNCTION notify.audit_history_preserving_actor ('recipient_safelist_history', 'id');

-- Rows created between V49 and V52 carry the database role instead of a user. Null them so the
-- UI shows nothing rather than a meaningless login name; the history table keeps the original.
UPDATE notify.recipient_safelist
SET
  created_by = NULL
WHERE
  created_by IS NOT NULL
  AND created_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND created_by NOT IN ('system', 'migration');

COMMIT;
