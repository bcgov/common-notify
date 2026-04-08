-- Seed initial tenants for local development with OAuth2 client IDs
-- These tenants will be used for testing OAuth2-based authentication in the local development environment
INSERT INTO
  tenants (
    name,
    oauth2_client_id,
    status,
    created_at,
    updated_at
  )
VALUES
  (
    'Test Tenant A',
    'test-client-a',
    'active',
    NOW (),
    NOW ()
  ),
  (
    'Test Tenant B',
    'test-client-b',
    'active',
    NOW (),
    NOW ()
  ),
  (
    'Test Tenant C',
    'test-client-c',
    'active',
    NOW (),
    NOW ()
  ) ON CONFLICT (oauth2_client_id) DO NOTHING;
