-- Add quarantine_details column to store ClamAV scan results
-- Purpose: Track malware detection details when a notification is quarantined
BEGIN;

ALTER TABLE notify.notification_request
ADD COLUMN quarantine_details JSONB;

-- Add comment documenting the column structure
COMMENT ON COLUMN notify.notification_request.quarantine_details IS 'JSONB data structure storing ClamAV quarantine information. Example: {"viruses": ["Win.Test.EICAR_HDB-1"], "filename": "document.pdf", "scannedAt": "2026-05-19T10:30:00Z", "reason": "Malware detected during content scanning"}';

COMMIT;
