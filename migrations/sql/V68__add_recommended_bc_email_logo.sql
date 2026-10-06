INSERT INTO notify.email_logo (name, file_key, source_code, status_code, tenant_id, is_deleted)
SELECT
  'Main BC Mark (horizontal)',
  'logos/BCID_H_RGB_pos.svg',
  'SYSTEM',
  'APPROVED',
  NULL,
  FALSE
WHERE NOT EXISTS (
  SELECT 1
  FROM notify.email_logo
  WHERE file_key = 'logos/BCID_H_RGB_pos.svg'
    AND source_code = 'SYSTEM'
    AND status_code = 'APPROVED'
    AND is_deleted = FALSE
);
