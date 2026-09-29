-- Link a dispatched notification_request back to the event that produced it.
ALTER TABLE notify.notification_request
ADD COLUMN event_id UUID NULL;

-- SET NULL rather than CASCADE: deleting an event must not delete the record of what it sent.
ALTER TABLE notify.notification_request
ADD CONSTRAINT fk_notification_request_event FOREIGN KEY (event_id) REFERENCES notify.notification_event (id) ON DELETE SET NULL;

COMMENT ON COLUMN notify.notification_request.event_id IS 'The event this request was generated from, when it came from one. NULL for every other send. The delivery worker reads it to apply the event''s sender address and custom header.';

-- Partial: only event-sourced requests carry a value, and the question asked of this column is
-- always "what did this event send?".
CREATE INDEX idx_notification_request_event ON notify.notification_request (event_id)
WHERE
  event_id IS NOT NULL;
