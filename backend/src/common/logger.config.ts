import { WinstonModule, utilities } from 'nest-winston'
import * as winston from 'winston'
import LokiTransport from 'winston-loki'
import type { LoggerService } from '@nestjs/common'

// Determine if we're in production/k8s environment
const isProduction = process.env.NODE_ENV === 'production' ||
                     process.env.KUBERNETES_SERVICE_HOST !== undefined

const globalLoggerFormat: winston.Logform.Format = winston.format.timestamp({
  format: 'YYYY-MM-DD hh:mm:ss.SSS',
})

const localLoggerFormat: winston.Logform.Format = winston.format.combine(
  winston.format.colorize(),
  winston.format.align(),
  utilities.format.nestLike('Backend', { prettyPrint: true }),
)

// JSON format for production (Loki)
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
)

// Configure transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    level: 'silly',
    format: isProduction ? jsonFormat : winston.format.combine(
      globalLoggerFormat,
      localLoggerFormat,
      winston.format.colorize({ level: true }),
    ),
  }),
]

// Debug environment detection
console.error(`[Logger] NODE_ENV: ${process.env.NODE_ENV}`)
console.error(`[Logger] KUBERNETES_SERVICE_HOST: ${process.env.KUBERNETES_SERVICE_HOST}`)
console.error(`[Logger] isProduction: ${isProduction}`)

// Add Loki transport in Kubernetes/production
if (isProduction) {
  const lokiUrl = process.env.LOKI_URL || 'http://loki.f6bc3f-dev.svc.cluster.local:3100'
  const namespace = process.env.NAMESPACE || 'f6bc3f-dev'
  const podName = process.env.HOSTNAME || 'unknown'
  const instanceLabel = process.env.INSTANCE_LABEL || 'common-notify-dev'

  // Determine environment from namespace
  const environment = namespace.includes('-dev') ? 'dev' :
                     namespace.includes('-test') ? 'test' :
                     namespace.includes('-prod') ? 'prod' : 'unknown'

  console.error(`[Logger] Initializing Loki transport with host: ${lokiUrl}`)
  console.error(`[Logger] LOKI_URL from env: ${process.env.LOKI_URL}`)
  console.error(`[Logger] Environment: ${environment}`)

  try {
    const lokiTransport = new LokiTransport({
      host: lokiUrl,
      labels: {
        job: 'common-notify-backend',
        namespace: namespace,
        pod: podName,
        app: 'backend',
        environment: environment,
        app_kubernetes_io_instance: instanceLabel,
      },
      json: true,
      format: winston.format.json(),
      replaceTimestamp: true,
      interval: 5, // Send logs every 5 seconds
      batching: true,
      clearOnError: true,
      onConnectionError: (err) => {
        console.error('Loki connection error:', err)
      },
    })
    transports.push(lokiTransport)
    console.error('[Logger] Loki transport added successfully')
  } catch (error) {
    console.error('[Logger] Failed to create Loki transport:', error)
  }
}

export const customLogger: LoggerService = WinstonModule.createLogger({
  level: process.env.LOG_LEVEL || 'debug', // Enable debug logs in production
  transports: transports,
  exitOnError: false,
})
