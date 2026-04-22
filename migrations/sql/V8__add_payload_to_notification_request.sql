-- Add payload column to notification_request table for retry purposes
ALTER TABLE notify.notification_request
ADD COLUMN payload jsonb NULL;

-- Comment explaining the column
COMMENT ON COLUMN notify.notification_request.payload IS 'Stores the request payload as JSON for retry purposes when Redis is temporarily unavailable';

-- Add error_reason column to track failure details for failed notifications
ALTER TABLE notify.notification_request
ADD COLUMN error_reason TEXT NULL;

-- Comment explaining the error_reason column
COMMENT ON COLUMN notify.notification_request.error_reason IS 'Stores the error message when a notification fails, useful for debugging and monitoring';

-- Create index for querying failed notifications with errors
CREATE INDEX idx_notification_request_status_error ON notify.notification_request (status, error_reason)
WHERE
  status = 'failed'
  AND error_reason IS NOT NULL;
