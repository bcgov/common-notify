-- Add payload column to notification_request table for retry purposes
ALTER TABLE notify.notification_request
ADD COLUMN payload jsonb NULL;

-- Comment explaining the column
COMMENT ON COLUMN notify.notification_request.payload IS 'Stores the request payload as JSON for retry purposes when Redis is temporarily unavailable';
