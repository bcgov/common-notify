-- Add MSGAPP and MULTIPLE channel codes if they don't already exist
INSERT INTO
  notify.notification_channel_code (
    channel_code,
    description,
    display_name,
    created_by,
    updated_by
  )
VALUES
  (
    'MSGAPP',
    'Messaging app notification channel',
    'MsgApp',
    'system',
    'system'
  ),
  (
    'MULTIPLE',
    'Multiple channels (email, sms, or msgapp combined)',
    'Multiple',
    'system',
    'system'
  ) ON CONFLICT (channel_code) DO NOTHING;
