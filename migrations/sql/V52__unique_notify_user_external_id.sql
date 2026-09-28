-- V51: Make notify_user.external_id unique among active users.
--
-- external_id is the identity provider's user ID (the IDIR GUID) and is already treated as a key
-- by the application: UsersService.findByExternalId does findOne({ where: { externalId } }), and
-- upsertUser looks a user up by it before deciding to insert or update. Nothing in the schema
-- enforced that, so a race between two concurrent upserts could leave two rows for one person -
-- after which findOne returns an arbitrary one of them.
--
-- The safelist screen resolves 'added by' through this column, and joins on a non-unique column
-- silently duplicate rows, so this constraint is a prerequisite for that lookup being correct.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Collapse any duplicates that already exist.
-- ---------------------------------------------------------------------------
-- Keeps the most recently updated row for each external_id and soft deletes the rest, so no user
-- record is destroyed and the survivor is the one the application has been maintaining. Without
-- this step the index below would fail to create and take the whole migration with it.
WITH
  ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          external_id
        ORDER BY
          updated_at DESC,
          created_at DESC,
          id
      ) AS row_rank
    FROM
      notify.notify_user
    WHERE
      is_deleted = FALSE
      AND external_id IS NOT NULL
  )
UPDATE notify.notify_user AS u
SET
  is_deleted = TRUE,
  updated_by = 'migration-v51'
FROM
  ranked
WHERE
  u.id = ranked.id
  AND ranked.row_rank > 1;

-- ---------------------------------------------------------------------------
-- 2. Enforce uniqueness going forward.
-- ---------------------------------------------------------------------------
-- Partial on is_deleted so a soft deleted user does not block the same person being re-created,
-- matching the pattern used by idx_notify_user_active and the safelist's own unique index.
-- NULL external_id rows are excluded: users that have never been linked to an identity provider
-- are not duplicates of one another.
-- IF NOT EXISTS so the script is re-runnable against a database where the index was created
-- outside Flyway. Note it matches on name only: an index of this name with a different
-- definition would be kept rather than replaced.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notify_user_external_id ON notify.notify_user (external_id)
WHERE
  is_deleted = FALSE
  AND external_id IS NOT NULL;

COMMENT ON INDEX notify.uq_notify_user_external_id IS 'One active notify_user per identity provider ID. Enforces the uniqueness UsersService.findByExternalId already assumes, and makes joins on external_id safe.';

COMMIT;
