-- Add quarantined notification status for ClamAV malware detection
INSERT INTO
  notification_status_code (code, description, display_name, created_by)
VALUES
  (
    'quarantined',
    'Notification blocked due to malware detected in attachment by ClamAV scanning',
    'Quarantined',
    'system'
  );
