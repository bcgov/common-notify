export default () => {
  const defaultEmailFrom = process.env.DEFAULT_EMAIL_FROM || 'noreply@notify-test.gov.bc.ca'
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
      jwtIssuer: process.env.JWT_ISSUER,
      keycloakClientId: process.env.KEYCLOAK_CLIENT_ID,
    },

    // CHES (Common Hosted Email Service)
    ches: {
      baseUrl: process.env.CHES_BASE_URL,
      clientId: process.env.CHES_CLIENT_ID,
      clientSecret: process.env.CHES_CLIENT_SECRET,
      tokenUrl: process.env.CHES_TOKEN_URL,
      from: process.env.CHES_FROM || defaultEmailFrom,
    },
  }
}
