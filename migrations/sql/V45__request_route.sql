-- Add request_route column to record which controller route accepted the request
-- Purpose: Track the API route hit (e.g. 'notifysimple', 'notifysimple/email',
-- 'notifysimple/sms') so incoming requests can be attributed to their originating endpoint.
BEGIN;

ALTER TABLE notify.notification_request
ADD COLUMN request_route VARCHAR(255);

COMMENT ON COLUMN notify.notification_request.request_route IS 'API route that accepted the request, relative to the versioned prefix (e.g. ''notifysimple'', ''notifysimple/email'', ''notifysimple/sms''). Nullable for records created before this column existed.';

COMMIT;
