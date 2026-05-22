-- Add additional user fields to notify_user table to align with AuthUser JWT claims
-- This enables storing username and name components for better audit trail display
ALTER TABLE notify.notify_user
ADD COLUMN IF NOT EXISTS username VARCHAR(100),
ADD COLUMN IF NOT EXISTS given_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS family_name VARCHAR(100);

-- Create an index on username for quick lookups
CREATE INDEX IF NOT EXISTS idx_notify_user_username ON notify.notify_user (username)
WHERE
  is_deleted = FALSE;

-- Create an index on email for quick lookups
CREATE INDEX IF NOT EXISTS idx_notify_user_email ON notify.notify_user (email)
WHERE
  is_deleted = FALSE;

-- Add comments for documentation
COMMENT ON COLUMN notify.notify_user.username IS 'Username of the user, sourced from the identity provider. Used for audit trail display.';

COMMENT ON COLUMN notify.notify_user.given_name IS 'Given name (first name) of the user, sourced from the identity provider (givenName claim).';

COMMENT ON COLUMN notify.notify_user.family_name IS 'Family name (last name) of the user, sourced from the identity provider (familyName claim).';
