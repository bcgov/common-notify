-- Add history table for notification_request
CREATE TABLE 
  notify.notification_request_history (
    h_id uuid DEFAULT notify.uuid_generate_v4() NOT NULL PRIMARY KEY,
    target_row_id uuid NOT NULL,
    operation_type char(1) NOT NULL,
    operation_user varchar(200) DEFAULT CURRENT_USER NOT NULL,
    operation_executed_at timestamptz DEFAULT now() NOT NULL,
    data_after_operation jsonb NOT NULL
  );

CREATE INDEX idx_nr_history_target_row 
  ON notify.notification_request_history(target_row_id);

CREATE INDEX idx_nr_history_timestamp 
  ON notify.notification_request_history(operation_executed_at DESC);

CREATE INDEX idx_nr_history_user 
  ON notify.notification_request_history(operation_user);

CREATE INDEX idx_nr_history_operation 
  ON notify.notification_request_history(operation_type);

CREATE INDEX idx_nr_history_data 
  ON notify.notification_request_history USING GIN (data_after_operation);

COMMENT ON TABLE notify.notification_request_history IS 
  'Immutable audit log of all changes to notification_request. Each row captures a complete snapshot after INSERT/UPDATE/DELETE. Populated automatically by audit_history() trigger.';

COMMENT ON COLUMN notify.notification_request_history.h_id IS 
  'Unique identifier for this history record';

COMMENT ON COLUMN notify.notification_request_history.target_row_id IS 
  'Foreign key to notification_request.id that was changed';

COMMENT ON COLUMN notify.notification_request_history.operation_type IS 
  'Type of operation: I=INSERT, U=UPDATE, D=DELETE';

COMMENT ON COLUMN notify.notification_request_history.operation_user IS 
  'User who performed the operation (from app.current_user or database user)';

COMMENT ON COLUMN notify.notification_request_history.operation_executed_at IS 
  'Server timestamp when operation occurred (always NOW() at trigger time)';

COMMENT ON COLUMN notify.notification_request_history.data_after_operation IS 
  'Complete JSON snapshot of the row after the operation. For UPDATE/INSERT: NEW row. For DELETE: OLD row.';

-- Create function used to populate history tables
CREATE OR REPLACE FUNCTION notify.audit_history() 
RETURNS TRIGGER AS $$
DECLARE
  v_history_table TEXT;
  v_pk_column TEXT;
BEGIN
  v_history_table := TG_ARGV[0];
  v_pk_column := TG_ARGV[1];

  -- For INSERT and UPDATE, enforce audit fields
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(current_setting('app.current_user', true), current_user);
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := now();
      NEW.created_by := COALESCE(current_setting('app.current_user', true), current_user);
    ELSE
      NEW.created_at := OLD.created_at;
      NEW.created_by := OLD.created_by;
    END IF;
  END IF;

  -- Capture to history (AFTER trigger instead)
  EXECUTE format(
    'INSERT INTO notify.%I (target_row_id, operation_type, operation_user, 
     operation_executed_at, data_after_operation) VALUES ($1.%I, %L, %L, now(), to_jsonb($1))',
    v_history_table, v_pk_column, SUBSTRING(TG_OP, 1, 1), 
    COALESCE(current_setting('app.current_user', true), current_user)
  ) USING NEW;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger that uses the new function to generate a history table entry whenever an INSERT or UPDATE occurs
CREATE TRIGGER notification_request_audit
BEFORE INSERT OR UPDATE ON notify.notification_request
FOR EACH ROW
EXECUTE FUNCTION notify.audit_history('notification_request_history', 'id');
