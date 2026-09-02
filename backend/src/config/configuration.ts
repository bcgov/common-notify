import * as path from 'path'

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

    // CSTAR (BC Services Card Authentication Service) - RBAC source of truth
    // Used to fetch user roles for role-based access control
    cstar: {
      baseUrl: process.env.CSTAR_API_URL || 'https://cstar-dev.apps.gold.devops.gov.bc.ca',
      // How long a user's CSTAR tenant list stays reusable. Every tenant-scoped frontend
      // request verifies membership, so without this a user clicking quickly through the
      // nav fires a burst of identical calls at CSTAR, and the failures come back as
      // "Failed to verify tenant access".
      //
      // This caches an authorization input, so it is deliberately short: a user removed
      // from a tenant keeps access for at most this long. Set to 0 to disable caching —
      // concurrent identical requests are still coalesced into one call, which is what
      // fixes the burst.
      userTenantsCacheTtlMs: parseInt(process.env.CSTAR_USER_TENANTS_CACHE_TTL_MS || '15000', 10),
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

    emailLogo: {
      seedAssetDirectory:
        process.env.EMAIL_LOGO_SEED_ASSET_DIRECTORY ||
        path.resolve(process.cwd(), '../migrations/assets/email-logos'),
      publicBaseUrl:
        process.env.PUBLIC_API_GATEWAY_BASE_URL || process.env.VITE_API_GATEWAY_NOTIFY_URL,
      publicPathPrefix: process.env.PUBLIC_API_GATEWAY_PATH_PREFIX || '',
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
