export default () => {
  const defaultEmailFrom = process.env.DEFAULT_EMAIL_FROM || 'notify_noreply@gov.bc.ca'
  const defaultSmsFrom = process.env.DEFAULT_SMS_FROM_NUMBER || '+15551234567'
  const defaultTemplateSubject = process.env.DEFAULT_TEMPLATE_SUBJECT || 'Notification'

  const isProd = process.env.NODE_ENV === 'production'
  const defaultLogLevel = isProd ? 'info' : 'debug'

  return {
    // Application
    port: parseInt(process.env.PORT || '3000', 10),
    environment: process.env.NODE_ENV || 'development',
    /** Express `trust proxy` hop count when `TRUST_PROXY` is set (required behind API gateway / LB for correct client IP + rate limiting). */

    // Logging (trace, debug, info, warn, error, fatal)
    log: {
      level: process.env.LOG_LEVEL || defaultLogLevel,
    },

    // Database
    database: {
      url: process.env.DATABASE_URL,
    },

    // Redis & Job Queues
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },

    // System defaults (used when sender store or provider override not set)
    defaults: {
      email: { from: defaultEmailFrom },
      sms: { fromNumber: defaultSmsFrom },
      templates: { defaultSubject: defaultTemplateSubject },
    },

    // Keycloak / JWT authentication
    auth: {
      jwksUri: process.env.JWKS_URI,
      frontendKeycloakIssuer: process.env.FRONTEND_KEYCLOAK_ISSUER,
      apiGatewayKeycloakIssuer: process.env.API_GATEWAY_KEYCLOAK_ISSUER,
      notifyClientId: process.env.NOTIFY_CLIENT_ID,
    },

    // CHES (Common Hosted Email Service)
    ches: {
      baseUrl: process.env.CHES_BASE_URL,
      clientId: process.env.CHES_CLIENT_ID,
      clientSecret: process.env.CHES_CLIENT_SECRET,
      tokenUrl: process.env.CHES_TOKEN_URL,
      from: process.env.DEFAULT_EMAIL_FROM || defaultEmailFrom,
    },

    // GC Notify
    gcNotify: {
      baseUrl: process.env.GC_NOTIFY_BASE_URL,
    },

    // Kong Admin API (for API key management)
    kong: {
      adminUrl: process.env.KONG_ADMIN_URL,
      adminTokenEndpoint: process.env.KONG_ADMIN_TOKEN_ENDPOINT,
      adminClientId: process.env.KONG_ADMIN_CLIENT_ID,
      adminClientSecret: process.env.KONG_ADMIN_CLIENT_SECRET,
    },

    // APS Directory API (API Programme Services) — Credential Issuer.
    // Lets Notify issue and regenerate gateway consumer credentials on behalf of a
    // tenant instead of the tenant requesting a key through the API Services Portal.
    // Requires an APS service account with the CredentialIssuer.Generate scope on the
    // gateway. When clientId/clientSecret are absent the issuer falls back to the local
    // Kong Admin API (dev only) — see credential-issuer.module.ts.
    aps: {
      baseUrl: process.env.APS_API_BASE_URL,
      gatewayId: process.env.APS_GATEWAY_ID,
      environmentAppId: process.env.APS_ENVIRONMENT_APP_ID,
      tokenUrl: process.env.APS_TOKEN_URL,
      clientId: process.env.APS_CLIENT_ID,
      clientSecret: process.env.APS_CLIENT_SECRET,
      // Optional. Left unset, Keycloak issues the service account's default scopes,
      // which already carry CredentialIssuer.Generate. Set it only if the realm
      // requires the scope to be requested explicitly.
      scope: process.env.APS_TOKEN_SCOPE,
      timeoutMs: parseInt(process.env.APS_TIMEOUT_MS || '15000', 10),
    },

    // CSTAR (BC Services Card Authentication Service) - RBAC source of truth
    // Used to fetch user roles for role-based access control
    cstar: {
      baseUrl: process.env.CSTAR_API_URL || 'https://cstar-dev.apps.gold.devops.gov.bc.ca',
    },

    // Twilio SMS Service
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER || defaultSmsFrom,
    },

    acs: {
      connectionString: process.env.ACS_CONNECTION_STRING,
      fromNumber: process.env.ACS_FROM_NUMBER || defaultSmsFrom,
    },

    // Delivery Adapter Selection
    delivery: {
      email: process.env.DELIVERY_EMAIL_ADAPTER || 'ches',
      sms: process.env.DELIVERY_SMS_ADAPTER || 'twilio',
    },

    // Load-test-only switches. MUST stay false outside DEV / ephemeral PR dev envs.
    // When enabled, the api-key bind endpoint self-binds the calling key to a
    // throwaway load-test tenant without a user JWT / CSTAR membership check, so a
    // load test can authenticate without a manual binding step.
    //
    // Hard-gated to non-test/prod namespaces: all environments run NODE_ENV=production,
    // so the namespace (…-dev / …-test / …-prod) is the reliable discriminator. Even if
    // LOADTEST_AUTOBIND_ENABLED were somehow set in test/prod, this stays false there.
    loadtest: {
      autobindEnabled:
        process.env.LOADTEST_AUTOBIND_ENABLED === 'true' &&
        !['-test', '-prod'].some((s) => (process.env.NAMESPACE || '').includes(s)),
    },

    // S3-compatible object storage
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    },

    // ClamAV
    clamav: {
      host: process.env.CLAMAV_HOST || 'localhost',
      port: parseInt(process.env.CLAMAV_PORT || '3310', 10),
      timeout: parseInt(process.env.CLAMAV_TIMEOUT || '30000', 10),
      enabled: process.env.CLAMAV_ENABLED !== 'false',
      failClosed: process.env.CLAMAV_FAIL_CLOSED === 'true',
    },

    // Job Queue Worker Configuration
    queue: {
      ingestionWorkerConcurrency: parseInt(process.env.INGESTION_WORKER_CONCURRENCY || '1', 10),
      // Number of recipients per mail merge delivery batch
      batchSize: parseInt(process.env.BATCH_SIZE || '100', 10),
      emailDeliveryWorkerConcurrency: parseInt(
        process.env.EMAIL_DELIVERY_WORKER_CONCURRENCY || '20',
        10,
      ),
      smsDeliveryWorkerConcurrency: parseInt(
        process.env.SMS_DELIVERY_WORKER_CONCURRENCY || '2',
        10,
      ),
      jobRetries: parseInt(process.env.JOB_RETRIES || '3', 10),
      jobBackoffDelay: parseInt(process.env.JOB_BACKOFF_DELAY || '2000', 10),
      pendingRetryInterval: parseInt(process.env.PENDING_RETRY_INTERVAL || '30000', 10),
    },

    // Encryption
    encryption: {
      key: process.env.WEBHOOK_ENCRYPTION_KEY,
    },
  }
}
